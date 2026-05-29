FROM python:3.12-slim

WORKDIR /app
COPY workers/ingestion-worker/worker.py ./worker.py

CMD ["python", "worker.py"]
