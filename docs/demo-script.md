# Demo script (≤ 5 phút)

Luồng: **topology → simulation → impact + action matrix → empty/error state**. Mọi số liệu trên UI lấy từ API thật (`/graph/topology`, `/incidents/simulate`, `/health`); không có dữ liệu giả.

## Chuẩn bị (trước khi demo)

```bash
docker compose up -d neo4j
docker exec -i incident_neo4j cypher-shell -u neo4j -p incidentpassword123 < backend/data/migrations/001_init_constraints.cypher
docker exec -i incident_neo4j cypher-shell -u neo4j -p incidentpassword123 < backend/data/seed_scenarios.cypher

cd backend && PYTHONPATH=. uvicorn app.main:app --port 8000      # terminal 1
cd frontend && npm install && npm run dev                          # terminal 2 → http://localhost:5173
```

Kiểm tra nhanh: sidebar hiện **Backend & Neo4j connected**, KPI **Graph nodes = 19**, **Relations = 31**.
Nếu backend không ở `localhost:8000`, đặt `VITE_API_BASE=http://<host>:<port>/api/v1` trong `frontend/.env.local`.

## Kịch bản

| Thời gian | Thao tác | Kết quả cần thấy |
|---|---|---|
| 0:00–0:45 | Giới thiệu topology. | Dây chuyền 5 bước từ trái sang phải (Paste → SMT → Reflow → AOI → Pack). Equipment ở dưới, Batch/IncidentEvent ở trên, Department ở hàng cuối. Cạnh liền = quan hệ propagation (`OPERATES_IN`, `FLOWS_TO`, `AFFECTS`), cạnh đứt = quan hệ khác. |
| 0:45–2:00 | Chọn card **Machine breakdown** (`EQ_OVEN_01`), severity **1.0**, bấm **Run simulation**. | Graph: `EQ_OVEN_01` đỏ viền trắng (origin), 3 node cam có điểm, đường propagation màu cam. Bảng: `STEP_REFLOW` 1 hop **0.750**, `STEP_AOI` 2 hop **0.562**, `STEP_PACK` 3 hop **0.422** (= 1.0 × 0.75^d). KPI: 3 impacted, peak 0.750. |
| 2:00–2:40 | Kéo xuống **Recommended actions**. Tick 1–2 card. | 4 card DEP_MAINT/PROD/QA/SCM với tên bộ phận lấy từ graph, note CONTEXT "Incident origin: EQ_OVEN_01…", bộ đếm "x/4 complete". |
| 2:40–3:20 | Click node **High-speed Pick & Place** trên graph (hoặc card **Material quality defect**), severity **0.8**, Run. | Origin đổi sang `STEP_SMT`. Điểm: **0.600 / 0.450 / 0.338**. Simulation log bên phải có 2 dòng. |
| 3:20–3:50 | Chọn origin `BATCH_2026_001` trong dropdown, Run. | Empty state: **NO PROPAGATION**, "Không có node downstream bị ảnh hưởng" (batch chỉ có `PROCESSED_BY`, không thuộc quan hệ propagation). Graph bỏ highlight. |
| 3:50–4:30 | (Tuỳ chọn) `docker stop incident_neo4j`, đợi ≤ 15 giây hoặc reload trang. | Banner đỏ "Neo4j chưa sẵn sàng", sidebar **Neo4j unavailable**, panel topology báo lỗi + nút **Thử lại**. Trang không trắng. `docker start incident_neo4j` → bấm **Retry** → graph quay lại. |
| 4:30–5:00 | Tổng kết. | React → FastAPI → Neo4j; impact = severity × decay^distance, tối đa `MAX_HOPS`; playbook theo incident type. |

## Lưu ý khi demo

- Highlight trên graph và bảng impact luôn là của **lần chạy gần nhất**; nếu lần chạy lỗi, kết quả cũ được ẩn để không hiển thị dữ liệu cũ như dữ liệu hiện tại.
- Nội dung action theo incident type là playbook tĩnh của backend (ví dụ MACHINE_BREAKDOWN luôn nhắc `EQ_OVEN_01`), chỉ dòng CONTEXT thay đổi theo origin.
