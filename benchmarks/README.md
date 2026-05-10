# PROMETHEUS Benchmarks

Performance, cost, quality, and concurrency baselines plus regression thresholds.
All scripts run from the repo root.

## Suites

| Script                       | Tool   | What it measures                                      |
|------------------------------|--------|-------------------------------------------------------|
| `locust_pipeline.py`         | Locust | RPS load on `POST /api/generate` — p50/p95/p99 + ERR  |
| `k6_sse.js`                  | k6     | 1000 concurrent EventSource — heartbeats, drop rate   |
| `cost_benchmark.py`          | Python | Cost + latency per agent + total on 50 golden ideas   |
| `quality_benchmark.py`       | Python | Judge scores per agent + per-axis p99 on 50 golden    |
| `concurrency_benchmark.py`   | Python | Wall-time vs. N concurrent pipelines — queue lag knee |

## Running

```bash
# Locust at 100 users for 5 min:
locust -f benchmarks/locust_pipeline.py --headless \
       --users 100 --spawn-rate 10 --run-time 5m \
       --host http://localhost:8080

# k6 — 1000 concurrent SSE for 60 s:
k6 run -u 1000 -d 60s benchmarks/k6_sse.js

# Cost benchmark — mocked (offline) or real Gemini:
python benchmarks/cost_benchmark.py --out reports/cost.csv --mocked
python benchmarks/cost_benchmark.py --out reports/cost.csv  # real Gemini

# Quality benchmark:
python benchmarks/quality_benchmark.py --out reports/quality.csv --mocked

# Concurrency benchmark:
python benchmarks/concurrency_benchmark.py --out reports/conc.csv --levels 1,10,50,100
```

## Baselines (V2 launch targets)

| Metric                         | Target          | Hard fail above |
|--------------------------------|-----------------|-----------------|
| `POST /api/generate` p95       | ≤ 400 ms        | 1000 ms         |
| `POST /api/generate` p99       | ≤ 1000 ms       | 2000 ms         |
| Pipeline end-to-end (mocked)   | ≤ 2.5 s         | 6 s             |
| Pipeline end-to-end (real)     | 75–120 s        | 240 s           |
| Per-session cost               | ≤ $1.20         | $2.50 (cap)     |
| Aggregate judge score          | ≥ 7.5 / 10      | < 6.0 / 10      |
| `p99 anti_slop`                | ≥ 7.0           | < 5.0           |
| SSE first event                | ≤ 2 s           | 5 s             |
| SSE drop rate (60 s @ 1000 vu) | 0%              | > 1%            |
| Error rate (load test)         | ≤ 0.5%          | > 2%            |

## Regression policy

CI runs `cost_benchmark.py --mocked` and `quality_benchmark.py --mocked` on every
PR. PR is blocked if:

- aggregate cost on 50 golden ideas regresses by > 10%
- aggregate judge score regresses by > 5%
- `anti_slop` p99 drops below 7.0
- median pipeline elapsed time regresses by > 20%

## Reports

All scripts write CSV under `reports/` (gitignored). Diff against the previous
baseline checked into `infrastructure/baselines/` to spot regressions.
