# GroveWorks wrapper for SHAMBA v1.2.
#
# The upstream model is cloned at a pinned commit; it is NOT copied into the
# regenworks repository (SHAMBA is under the University of Edinburgh's Open
# Technology terms, not an open-source licence). Keep images built from this
# file private (local builds or a private registry) until the terms are checked.
#
#   docker build -t groveworks/shamba models/shamba
#   docker run --rm -p 8080:8080 --network none ... (see ../README.md)

FROM python:3.10.16-slim AS upstream
ARG SHAMBA_COMMIT=c98f5ef07c43c2841ef7e025f92ff52901f18c72
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN git init /src && cd /src \
    && git remote add origin https://github.com/shamba-model/shamba \
    && git fetch --depth 1 origin "${SHAMBA_COMMIT}" \
    && git checkout --detach FETCH_HEAD \
    && rm -rf .git shamba/client shamba/server shamba/tests

FROM python:3.10.16-slim
ARG SHAMBA_COMMIT=c98f5ef07c43c2841ef7e025f92ff52901f18c72

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY --from=upstream /src/shamba /opt/shamba/shamba
COPY --from=upstream /src/LICENCE.txt /opt/shamba/LICENCE.txt
COPY adapter /app/adapter

ENV SHAMBA_SRC=/opt/shamba/shamba \
    SHAMBA_COMMIT=${SHAMBA_COMMIT} \
    MPLBACKEND=Agg \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

RUN useradd --system --uid 10001 --home /tmp runner
USER 10001
WORKDIR /app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:8080/health'); sys.exit(0)"

# One worker: SHAMBA_MAX_CONCURRENT controls how many runs the worker starts.
CMD ["uvicorn", "adapter.server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
