# SomaiyaNet on Render: one image that builds the React app and runs the FastAPI backend, which
# serves the built app and the API from the same address (so the login cookie and the live
# stream need no CORS or cross-site cookies).

# 1. Build the React app.
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json web/.npmrc ./
RUN npm ci
COPY web/ ./
RUN npm run build

# 2. Run the API (it also serves web/dist).
FROM python:3.14-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ backend/
COPY scripts/ scripts/
COPY db/ db/
COPY --from=web /web/dist web/dist
# Render sets PORT; secrets come from the secret file /etc/secrets/.env (see scripts/_db.py).
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
