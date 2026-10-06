# Runbook chạy dự án

## Cách 1: Docker

Yêu cầu: Docker và Docker Compose.

```bash
docker compose up --build
```

Kiểm tra backend:

```bash
curl http://localhost:8000/health
```

Neo4j Browser: `http://localhost:7474`.

Sau khi Neo4j khởi động, chạy migration và seed theo file trong `backend/data/`:

```bash
docker exec -i incident_neo4j cypher-shell \
  -u neo4j -p incidentpassword123 \
  < backend/data/migrations/001_init_constraints.cypher

docker exec -i incident_neo4j cypher-shell \
  -u neo4j -p incidentpassword123 \
  < backend/data/seed_scenarios.cypher
```

## Cách 2: chạy local

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=. uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Frontend mặc định gọi `http://localhost:8000/api/v1`.

## Test

```bash
PYTHONPATH=backend pytest -q
cd frontend && npm run build
```

## Biến môi trường

| Tên | Mặc định | Ý nghĩa |
|---|---|---|
| `NEO4J_URI` | `bolt://localhost:7687` | Địa chỉ Neo4j |
| `NEO4J_USER` | `neo4j` | User Neo4j |
| `NEO4J_PASSWORD` | `incidentpassword123` | Mật khẩu Neo4j |
| `DECAY_RATE` | `0.75` | Hệ số giảm theo hop |
| `MAX_HOPS` | `4` | Số hop tối đa |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Origin frontend |
