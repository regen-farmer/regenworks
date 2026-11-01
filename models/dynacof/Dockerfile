# GroveWorks wrapper for DynACof.jl 1.5.3 (GPL-3.0).
#
# Julia packages come from the General registry at the exact versions in
# worker/Manifest.toml; DynACof's code is not copied into this repository.
#
#   docker build -t groveworks/dynacof models/dynacof

FROM julia:1.10.4-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Python side: HTTP server, validation, worker pool
COPY requirements.txt /app/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r /app/requirements.txt

# Julia side: install and precompile the pinned packages into a read-only depot
ENV JULIA_DEPOT_PATH=/opt/julia-depot JULIA_PKG_PRECOMPILE_AUTO=0
COPY worker/Project.toml worker/Manifest.toml /app/worker/
RUN julia --project=/app/worker -e 'using Pkg; Pkg.instantiate(); Pkg.precompile(); using DynACof' \
    && chmod -R a+rX /opt/julia-depot
COPY worker/*.jl /app/worker/
COPY adapter /app/adapter

# At run time a writable depot in /tmp comes first, the prebuilt one second.
ENV JULIA_DEPOT_PATH=/tmp/julia:/opt/julia-depot \
    JULIA_PKG_OFFLINE=true \
    JULIA=julia \
    DYNACOF_WORKER_DIR=/app/worker \
    PATH=/opt/venv/bin:$PATH \
    PYTHONPATH=/app \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN useradd --system --uid 10001 --home /tmp runner
USER 10001
WORKDIR /app
EXPOSE 8080

# Workers compile DynACof on boot (~20-60 s); /health says "starting" until then.
HEALTHCHECK --start-period=180s --interval=30s --timeout=3s CMD python3 -c "import json,urllib.request,sys; sys.exit(0 if json.load(urllib.request.urlopen('http://127.0.0.1:8080/health'))['status']=='ok' else 1)"

CMD ["uvicorn", "adapter.server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
