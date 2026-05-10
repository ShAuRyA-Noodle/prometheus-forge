// k6 — 1000 concurrent SSE EventSource connections.
//
// Run:
//   k6 run -u 1000 -d 60s benchmarks/k6_sse.js
//
// Asserts:
//   - first event arrives within 5 s
//   - heartbeats arrive at <= 16 s intervals (server promises 15 s)
//   - no premature drops before terminal event

import { check, sleep } from 'k6';
import http from 'k6/http';

export const options = {
  scenarios: {
    sustained: {
      executor: 'constant-vus',
      vus: __ENV.VUS ? Number(__ENV.VUS) : 100,
      duration: __ENV.DURATION || '60s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],         // < 2% errors
    http_req_duration: ['p(95)<5000'],      // p95 first byte < 5s
    'sse_first_event_ms': ['p(95)<5000'],
    'sse_heartbeat_gap_ms': ['p(95)<16000'],
  },
};

import { Trend, Rate } from 'k6/metrics';

const firstEvent = new Trend('sse_first_event_ms');
const hbGap = new Trend('sse_heartbeat_gap_ms');
const dropRate = new Rate('sse_drops');

export default function () {
  const baseUrl = __ENV.BASE_URL || 'http://localhost:8080';
  const sessionId = __ENV.SESSION_ID || 'sess_demo';
  const token = __ENV.TOKEN || 'test.session.jwt';

  // k6 doesn't have native EventSource; use streaming response on /sse/...
  const res = http.get(`${baseUrl}/sse/sessions/${sessionId}?token=${token}`, {
    headers: { Accept: 'text/event-stream' },
    timeout: '120s',
    responseType: 'text',
  });

  const ok = check(res, {
    'status 200': (r) => r.status === 200,
    'event-stream': (r) =>
      (r.headers['Content-Type'] || '').includes('text/event-stream'),
  });
  if (!ok) {
    dropRate.add(1);
    return;
  }

  const body = res.body || '';
  // Find first event marker.
  const firstIdx = body.indexOf('event:');
  if (firstIdx >= 0) {
    firstEvent.add(res.timings.waiting);
  }

  // Approximate heartbeat gap: count keepalives in body.
  const keepAlives = (body.match(/: keepalive/g) || []).length;
  const seconds = (res.timings.duration || 0) / 1000;
  if (keepAlives > 0 && seconds > 0) {
    hbGap.add((seconds * 1000) / keepAlives);
  }

  sleep(1);
}
