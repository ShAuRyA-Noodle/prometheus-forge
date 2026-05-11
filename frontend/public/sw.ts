/// <reference lib="webworker" />
/**
 * PROMETHEUS service worker.
 *
 * Strategies:
 *  - network-first for /api/* (5s timeout → fall back to cache → 503 JSON)
 *  - cache-first for /assets/* (long-lived hashed Vite chunks)
 *  - stale-while-revalidate for Imagen URLs (storage.googleapis.com / signed)
 *  - background-sync queue for failed POST /api/generate (replay when online)
 *  - push notifications: "generation complete" + "weekly market digest"
 *
 * This file is the TypeScript source. Vite compiles to public/sw.js during
 * `npm run build` (a small esbuild postbuild step in scripts/build-sw.mjs).
 * Registered by src/lib/registerSW.ts on app boot.
 */
declare const self: ServiceWorkerGlobalScope;

const VERSION = "v2.0.0";
const STATIC_CACHE = `prometheus-static-${VERSION}`;
const API_CACHE = `prometheus-api-${VERSION}`;
const IMAGE_CACHE = `prometheus-image-${VERSION}`;
const RETRY_DB = "prometheus-retry-queue";
const RETRY_STORE = "generate-retries";

const API_TIMEOUT_MS = 5_000;

// ─── Install: precache the app shell ───────────────────────────────────────
self.addEventListener("install", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // The exact list is rewritten at build time by scripts/build-sw.mjs.
      await cache.addAll(["/", "/index.html", "/manifest.webmanifest"]);
      await self.skipWaiting();
    })(),
  );
});

// ─── Activate: prune old versions ─────────────────────────────────────────
self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, API_CACHE, IMAGE_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // SSE must never be cached or intercepted — let it pass through.
  if (url.pathname.startsWith("/sse/")) {
    return;
  }

  // Background-sync replay for /api/generate when offline.
  if (event.request.method === "POST" && url.pathname === "/api/generate") {
    event.respondWith(networkOrEnqueueGenerate(event.request));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(apiNetworkFirst(event.request));
    return;
  }

  if (
    url.hostname.endsWith("googleapis.com") ||
    url.hostname.endsWith("ggpht.com") ||
    /\.(png|jpg|jpeg|webp|gif|svg|avif)$/i.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(event.request, IMAGE_CACHE));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(navigationFallback(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request, STATIC_CACHE));
});

async function apiNetworkFirst(request: Request): Promise<Response> {
  const cache = await caches.open(API_CACHE);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const resp = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (resp.ok && request.method === "GET") cache.put(request, resp.clone());
    return resp;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    return new Response(
      JSON.stringify({ code: "OFFLINE", message: "Request unavailable offline." }),
      { status: 503, headers: { "content-type": "application/json", "x-served-by": "sw-offline" } },
    );
  }
}

async function networkOrEnqueueGenerate(request: Request): Promise<Response> {
  try {
    return await fetch(request.clone());
  } catch {
    // Queue for replay on next online.
    const clone = request.clone();
    const body = await clone.text();
    await idbAdd(RETRY_DB, RETRY_STORE, {
      id: crypto.randomUUID(),
      url: request.url,
      method: request.method,
      headers: Array.from(request.headers.entries()),
      body,
      enqueued_at: Date.now(),
    });
    if ("sync" in self.registration) {
      try {
        await (self.registration as ServiceWorkerRegistration & {
          sync: { register: (tag: string) => Promise<void> };
        }).sync.register("generate-retry");
      } catch {
        /* noop */
      }
    }
    return new Response(
      JSON.stringify({
        code: "QUEUED_OFFLINE",
        message: "You're offline. We'll submit this idea automatically when you're back online.",
      }),
      { status: 202, headers: { "content-type": "application/json" } },
    );
  }
}

self.addEventListener("sync", (event: ExtendableEvent & { tag: string }) => {
  if (event.tag !== "generate-retry") return;
  event.waitUntil(replayQueuedGenerates());
});

async function replayQueuedGenerates(): Promise<void> {
  const items = await idbAll<{
    id: string;
    url: string;
    method: string;
    headers: [string, string][];
    body: string;
    enqueued_at: number;
  }>(RETRY_DB, RETRY_STORE);
  for (const item of items) {
    try {
      const resp = await fetch(item.url, {
        method: item.method,
        headers: new Headers(item.headers),
        body: item.body,
      });
      if (resp.ok) {
        await idbDelete(RETRY_DB, RETRY_STORE, item.id);
        await notifyClients({ type: "queued-generate-replayed", id: item.id });
      }
    } catch {
      /* leave queued, next sync will retry */
    }
  }
}

async function staleWhileRevalidate(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((resp) => {
      if (resp.ok) cache.put(request, resp.clone());
      return resp;
    })
    .catch(() => cached ?? Response.error());
  return cached ?? (await networkPromise);
}

async function cacheFirst(request: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const resp = await fetch(request);
  if (resp.ok) cache.put(request, resp.clone());
  return resp;
}

async function navigationFallback(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const indexed = await cache.match("/index.html");
    return indexed ?? new Response("Offline.", { status: 503 });
  }
}

// ─── Push notifications ───────────────────────────────────────────────────
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  let payload: { title: string; body: string; tag?: string; url?: string; image?: string } = {
    title: "PROMETHEUS",
    body: "",
  };
  try {
    payload = JSON.parse(event.data.text());
  } catch {
    payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag ?? "prometheus-generic",
      icon: "/icon-192.svg",
      badge: "/icon-192.svg",
      data: { url: payload.url ?? "/" },
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of clients) {
        if (c.url.includes(target)) {
          await c.focus();
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// ─── tiny IndexedDB helpers ───────────────────────────────────────────────
function idb(db: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(db, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(RETRY_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbAdd<T>(db: string, store: string, value: T): Promise<void> {
  const d = await idb(db);
  await new Promise<void>((res, rej) => {
    const tx = d.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbAll<T>(db: string, store: string): Promise<T[]> {
  const d = await idb(db);
  return await new Promise((res, rej) => {
    const tx = d.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result as T[]);
    req.onerror = () => rej(req.error);
  });
}
async function idbDelete(db: string, store: string, id: string): Promise<void> {
  const d = await idb(db);
  await new Promise<void>((res, rej) => {
    const tx = d.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function notifyClients(msg: unknown): Promise<void> {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of clients) c.postMessage(msg);
}

export {};
