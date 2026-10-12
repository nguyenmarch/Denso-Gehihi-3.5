# Runbook chạy dự án

Luồng Incident Navigator handoff mới: xem [demo-handoff-implementation.md](demo-handoff-implementation.md), dùng `npm run setup` và `npm run dev` tại repository root để đọc đúng `.env` local.

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
source .venv/bin/activate        # Windows PowerShell: .venv\Scripts\Activate.ps1
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
npm test                      # backend tests (không cần Neo4j)
npm run preflight             # cần Neo4j đã seed; kèm frontend build
npm run demo                  # HTTP rehearsal trên Neo4j thật, store tạm, port 8099
INAV_REQUIRE_LIVE=1 npm run demo   # thất bại nếu Gemini không trả narrative/answer thật
node scripts/ui_smoke.mjs --shots <thư mục>   # cần backend + frontend đang chạy; INAV_UI_BASE / INAV_API_BASE để đổi địa chỉ
```

Seed (chạy lại được, không xoá dữ liệu): `PYTHONPATH=backend .venv/Scripts/python.exe scripts/seed.py` trên Windows, `.venv/bin/python` trên Linux/macOS. Sau seed: 24 node / 40 quan hệ.

UI smoke ghi dữ liệu vào store của backend nó gọi, và kịch bản chỉ kích hoạt được một lần cho mỗi event. Vì vậy hãy chạy smoke trên backend riêng có store tạm, ví dụ:

```bash
INAV_STORE_PATH=/tmp/smoke.sqlite3 CORS_ORIGINS=http://127.0.0.1:5175 PYTHONPATH=backend .venv/bin/python -m uvicorn app.main:app --port 8001
VITE_API_BASE=http://127.0.0.1:8001/api/v1 npx --prefix frontend vite --port 5175 --strictPort   # chạy trong thư mục frontend
INAV_UI_BASE=http://127.0.0.1:5175 INAV_API_BASE=http://127.0.0.1:8001/api/v1 node scripts/ui_smoke.mjs --shots /tmp/inav-ui-shots
```

Chỉ chạy một backend trên port 8000: container `incident_backend` và uvicorn local cùng port sẽ làm trình duyệt gọi lẫn hai backend. Frontend phải mở ở origin có trong `CORS_ORIGINS` (mặc định `localhost:5173`/`127.0.0.1:5173`).

## Biến môi trường

| Tên | Mặc định | Ý nghĩa |
|---|---|---|
| `NEO4J_URI` | `bolt://localhost:7687` | Địa chỉ Neo4j |
| `NEO4J_USER` | `neo4j` | User Neo4j |
| `NEO4J_PASSWORD` | `incidentpassword123` | Mật khẩu Neo4j |
| `DECAY_RATE` | `0.75` | Hệ số giảm theo hop |
| `MAX_HOPS` | `4` | Số hop tối đa |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Origin frontend |
