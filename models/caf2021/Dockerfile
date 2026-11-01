# GroveWorks wrapper for CAF2021 (Coffee Agroforestry model, Marcel van Oijen).
#
# The Fortran source and the default parameter file are fetched at a pinned
# commit and compiled here; nothing from CAF2021 is copied into this repository.
# CAF2021 has no licence file (Zenodo lists "Other (Open)"); Grove uses it for
# research in APCCO. Keep images private.
#
#   docker build -t groveworks/caf2021 models/caf2021

FROM python:3.11-slim-bookworm AS build
ARG CAF2021_COMMIT=e752e2024c420cb1f4518fcfc29010fa65670afd
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates gfortran \
    && rm -rf /var/lib/apt/lists/*
RUN git init /src && cd /src \
    && git remote add origin https://github.com/MarcelVanOijen/CAF2021 \
    && git fetch --depth 1 origin "${CAF2021_COMMIT}" \
    && git checkout --detach FETCH_HEAD
# Same flags and file order as upstream compile_CAF2021.command, plus -fPIC.
RUN cd /src/model && gfortran -O3 -fPIC -fdefault-real-8 -c \
        declare_parameters.f90 environment.f90 abovegroundres.f90 management.f90 tree.f90 shade.f90 \
        scaling.f90 coffee.f90 belowgroundres.f90 soil.f90 set_params.f90 CAF2021.f90 \
    && gfortran -shared -o /src/libcaf2021.so *.o

FROM python:3.11-slim-bookworm
ARG CAF2021_COMMIT=e752e2024c420cb1f4518fcfc29010fa65670afd
RUN apt-get update && apt-get install -y --no-install-recommends libgfortran5 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY --from=build /src/libcaf2021.so /opt/caf2021/libcaf2021.so
COPY --from=build /src/parameters/parameters_default.txt /opt/caf2021/parameters_default.txt
COPY adapter /app/adapter

ENV CAF2021_LIB=/opt/caf2021/libcaf2021.so \
    CAF2021_PARAMS=/opt/caf2021/parameters_default.txt \
    CAF2021_COMMIT=${CAF2021_COMMIT} \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

RUN useradd --system --uid 10001 --home /tmp runner
USER 10001
WORKDIR /app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:8080/health'); sys.exit(0)"

CMD ["uvicorn", "adapter.server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
