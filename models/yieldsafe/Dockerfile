# GroveWorks wrapper for Yield-SAFE v2 (Cranfield University).
#
# Yield-SAFE is published as an Excel workbook, so the model here is a Python port
# (yieldsafe/), tested against the workbook's cached results. It needs only the
# Python standard library; FastAPI and pydantic serve the HTTP contract.
#
# Terms: the authors allow use and modification for research and education;
# commercial use needs their permission (see NOTICE.md). Keep images private.
#
#   docker build -t groveworks/yieldsafe models/yieldsafe

FROM python:3.11-slim-bookworm

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY yieldsafe /app/yieldsafe
COPY adapter /app/adapter
COPY NOTICE.md /app/NOTICE.md

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

RUN useradd --system --uid 10001 --home /tmp runner
USER 10001
WORKDIR /app
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:8080/health'); sys.exit(0)"

CMD ["uvicorn", "adapter.server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
