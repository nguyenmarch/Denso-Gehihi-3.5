FROM python:3.11-slim

WORKDIR /app

# Railway builds this image from the repository root. Keep the backend paths
# explicit so the API can be deployed without configuring a monorepo root
# directory in the Railway dashboard.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
