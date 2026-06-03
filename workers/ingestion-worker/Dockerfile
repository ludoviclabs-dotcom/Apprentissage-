FROM python:3.12-slim

WORKDIR /app
COPY workers/ingestion-worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY workers/ingestion-worker/worker.py ./worker.py

CMD ["python", "worker.py"]
