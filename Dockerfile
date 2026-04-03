FROM python:3.10-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl unzip && \
    rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install backend dependencies
COPY backend/requirements.txt backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy frontend and build
COPY frontend/package.json frontend/
RUN cd frontend && bun install

# Copy source code
COPY frontend/ frontend/
COPY backend/ backend/

# Build frontend
RUN cd frontend && bun run build

# Start production image
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SQLITE_DB_PATH=/app/data/urlshortener.db

WORKDIR /app

# Copy python packages
COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn

# Copy backend and frontend build
COPY --from=builder /app/backend /app/backend
COPY --from=builder /app/frontend/dist /app/frontend/dist

# Ensure data directory exists
RUN mkdir -p /app/data && chown -R 1000:1000 /app/data

# Run as non-root user
USER 1000:1000

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]

# TODO: Add Docker HEALTHCHECK instruction

# TODO: Optimize with multi-stage build

# TODO: Add Docker image labels and metadata
