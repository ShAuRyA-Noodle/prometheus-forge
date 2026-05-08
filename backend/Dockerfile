# PROMETHEUS backend — multi-stage. Build with full Python, run distroless non-root.
# IMPORTANT: NEVER copy service-account JSON into image. Use Workload Identity Federation in prod.

# ─── Stage 1: builder ────────────────────────────────────────────────────────
FROM python:3.11-slim-bookworm AS builder

ARG GIT_SHA=unknown
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_SYSTEM_PYTHON=1

WORKDIR /build

# uv for fast hashed installs.
RUN pip install --no-cache-dir uv==0.5.7

COPY requirements.txt ./
# `--require-hashes` only kicks in if requirements has hashes; pip pinned versions is acceptable.
RUN uv pip install --system --no-cache --target /install -r requirements.txt

# Copy source
COPY . /src
RUN python -m compileall -q /src

# Trim test/cache cruft for runtime image.
RUN find /install -name "__pycache__" -type d -prune -exec rm -rf {} + \
    && find /install -name "*.dist-info" -type d -exec sh -c 'rm -rf "$1"/RECORD "$1"/INSTALLER' _ {} \; \
    && rm -rf /install/pip /install/setuptools /install/wheel

# ─── Stage 2: runtime (distroless, non-root) ────────────────────────────────
FROM gcr.io/distroless/python3-debian12:nonroot

ARG GIT_SHA=unknown
ENV PYTHONPATH=/app:/install \
    PORT=8080 \
    GIT_SHA=${GIT_SHA} \
    PROMETHEUS_VERSION=2.0.0

WORKDIR /app

COPY --from=builder /install /install
COPY --from=builder /src /app

USER nonroot:nonroot

EXPOSE 8080

# Distroless python image's entrypoint is `/usr/bin/python3.11`.
HEALTHCHECK --interval=30s --timeout=4s --start-period=20s --retries=3 \
    CMD ["/usr/bin/python3.11", "-c", \
         "import urllib.request,sys; \
          sys.exit(0) if urllib.request.urlopen('http://127.0.0.1:8080/health',timeout=3).status==200 else sys.exit(1)"]

ENTRYPOINT ["/usr/bin/python3.11", "-m", "uvicorn", "main:app", \
            "--host", "0.0.0.0", "--port", "8080", \
            "--proxy-headers", "--forwarded-allow-ips", "*", \
            "--workers", "1", "--loop", "uvloop", "--http", "httptools", \
            "--log-config", "/app/logging.json"]
