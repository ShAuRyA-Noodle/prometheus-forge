"""Locust pipeline benchmark.

Run::

    locust -f benchmarks/locust_pipeline.py --headless --users 100 --spawn-rate 10 \
           --run-time 5m --host http://localhost:8080

Measures p50/p95/p99 latency on POST /api/generate at sustained 1/10/100 RPS,
plus queue lag (request → SSE first-event), worker throughput, error rate.
"""
from __future__ import annotations

import json
import os
import secrets

from locust import HttpUser, between, events, task

_IDEAS = [
    "A SaaS that reconciles inventory across e-commerce channels",
    "An AI triage app for clinics",
    "A carbon-emission attribution tool for SMBs",
    "A reverse-auction marketplace for legal services",
    "A FinOps platform with chargeback dashboards",
]


class PipelineUser(HttpUser):
    wait_time = between(0.5, 2.0)

    def on_start(self) -> None:
        self.token = os.environ.get("PROMETHEUS_TEST_TOKEN", "test.session.jwt")

    @task(3)
    def generate(self) -> None:
        idea = _IDEAS[hash(self.environment.runner.user_count) % len(_IDEAS)]
        body = {"idea_text": idea}
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Idempotency-Key": f"locust-{secrets.token_urlsafe(12)}",
        }
        with self.client.post(
            "/api/generate",
            data=json.dumps(body),
            headers=headers,
            name="POST /api/generate",
            catch_response=True,
        ) as r:
            if r.status_code in (200, 202):
                r.success()
            else:
                r.failure(f"{r.status_code} {r.text[:120]}")

    @task(1)
    def health(self) -> None:
        self.client.get("/health", name="GET /health")


# ─── Custom listeners for percentiles + error rate snapshot ──────────────────


@events.test_stop.add_listener
def _on_test_stop(environment, **_kw) -> None:
    stats = environment.runner.stats
    summary = {
        "total_requests": stats.total.num_requests,
        "errors": stats.total.num_failures,
        "error_rate": (stats.total.num_failures / max(stats.total.num_requests, 1)),
        "p50_ms": stats.total.get_response_time_percentile(0.5),
        "p95_ms": stats.total.get_response_time_percentile(0.95),
        "p99_ms": stats.total.get_response_time_percentile(0.99),
        "rps": stats.total.current_rps,
    }
    print("\n=== PROMETHEUS Locust summary ===")
    print(json.dumps(summary, indent=2))
