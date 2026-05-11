#!/usr/bin/env node
// Build script: compile public/sw.ts → public/sw.js with esbuild + inject the
// hashed asset precache manifest from the latest Vite build.
//
// Invoked from package.json `build:sw` (which runs after `vite build`).

import { build } from "esbuild";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const SW_SRC = path.join(ROOT, "public", "sw.ts");
const SW_OUT = path.join(ROOT, "dist", "sw.js");
const ASSETS_DIR = path.join(ROOT, "dist", "assets");

async function listAssets() {
  try {
    const files = await readdir(ASSETS_DIR);
    return files
      .filter((f) => /\.(js|css|woff2?|svg|png)$/i.test(f))
      .map((f) => `/assets/${f}`);
  } catch {
    return [];
  }
}

async function main() {
  const assets = await listAssets();
  const precache = ["/", "/index.html", "/manifest.webmanifest", "/icon-192.svg", "/icon-512.svg", ...assets];

  await build({
    entryPoints: [SW_SRC],
    outfile: SW_OUT,
    bundle: true,
    minify: true,
    format: "iife",
    target: "es2022",
    platform: "browser",
    define: {
      __PROMETHEUS_PRECACHE_MANIFEST__: JSON.stringify(precache),
    },
    logLevel: "info",
  });

  // Replace the hard-coded addAll list with the precache manifest so cache
  // hits work for hashed Vite chunks.
  const compiled = await readFile(SW_OUT, "utf8");
  const replaced = compiled.replace(
    /\["\/","\/index\.html","\/manifest\.webmanifest"\]/,
    JSON.stringify(precache),
  );
  await writeFile(SW_OUT, replaced, "utf8");

  console.log(`[build-sw] wrote ${SW_OUT}`);
  console.log(`[build-sw] precaching ${precache.length} URLs`);
}

main().catch((err) => {
  console.error("[build-sw] failed", err);
  process.exit(1);
});
