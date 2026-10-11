# Demo script propagation cũ (≤ 5 phút)

Luồng Incident Navigator mới 8–10 phút: xem [demo-handoff-implementation.md](demo-handoff-implementation.md).

Luồng: **topology → simulation → impact + action matrix → empty/error state**. Mọi số liệu trên UI lấy từ API thật (`/graph/topology`, `/incidents/simulate`, `/health`); không có dữ liệu giả.

## Chuẩn bị (trước khi demo)

```bash
docker compose up -d neo4j
docker exec -i incident_neo4j cypher-shell -u neo4j -p incidentpassword123 < backend/data/migrations/001_init_constraints.cypher
docker exec -i incident_neo4j cypher-shell -u neo4j -p incidentpassword123 < backend/data/seed_scenarios.cypher

cd backend && PYTHONPATH=. uvicorn app.main:app --port 8000      # terminal 1
cd frontend && npm install && npm run dev                          # terminal 2 → http://localhost:5173
```

Kiểm tra nhanh: sidebar hiện **Backend & Neo4j đã kết nối**, KPI **Node trong graph = 19**, **Quan hệ = 31**.
Nếu backend không ở `localhost:8000`, đặt `VITE_API_BASE=http://<host>:<port>/api/v1` trong `frontend/.env.local`.

## Kịch bản

| Thời gian | Thao tác | Kết quả cần thấy |
|---|---|---|
| 0:00–0:45 | Giới thiệu topology. | Dây chuyền 5 bước từ trái sang phải (Paste → SMT → Reflow → AOI → Pack). Equipment ở dưới, Batch/IncidentEvent ở trên, Department ở hàng cuối. Cạnh liền = quan hệ propagation (`OPERATES_IN`, `FLOWS_TO`, `AFFECTS`), cạnh đứt = quan hệ khác. |
| 0:45–2:00 | Chọn card **Hỏng máy** (`EQ_OVEN_01`), mức độ **1.0**, bấm **Chạy mô phỏng**. | Graph: `EQ_OVEN_01` đỏ viền trắng (origin), 3 node cam có điểm, đường propagation màu cam. Bảng: `STEP_REFLOW` 1 hop **0.750**, `STEP_AOI` 2 hop **0.562**, `STEP_PACK` 3 hop **0.422** (= 1.0 × 0.75^d). KPI: 3 node bị ảnh hưởng, điểm cao nhất 0.750. |
| 2:00–2:40 | Kéo xuống **Hành động đề xuất**. Tick 1–2 card. | 4 card DEP_MAINT/PROD/QA/SCM với tên bộ phận lấy từ graph, note CONTEXT "Incident origin: EQ_OVEN_01…", bộ đếm "x/4 hoàn thành". |
| 2:40–3:20 | Click node **High-speed Pick & Place** trên graph (hoặc card **Lỗi chất lượng vật liệu**), mức độ **0.8**, **Chạy mô phỏng**. | Origin đổi sang `STEP_SMT`. Điểm: **0.600 / 0.450 / 0.338**. **Nhật ký sự cố & mô phỏng** có 2 dòng. |
| 3:20–3:50 | Chọn origin `BATCH_2026_001` trong dropdown, **Chạy mô phỏng**. | Empty state: **KHÔNG LAN TRUYỀN**, "Không có node downstream bị ảnh hưởng" (batch chỉ có `PROCESSED_BY`, không thuộc quan hệ propagation). Graph bỏ highlight. |
| 3:50–4:30 | (Tuỳ chọn) `docker stop incident_neo4j`, đợi ≤ 15 giây hoặc reload trang. | Banner đỏ "Neo4j chưa sẵn sàng", sidebar **Neo4j không sẵn sàng**, panel topology báo lỗi + nút **Thử lại**. Trang không trắng. `docker start incident_neo4j` → bấm **Thử lại** → graph quay lại. |
| 4:30–5:00 | Tổng kết. | React → FastAPI → Neo4j; impact = severity × decay^distance, tối đa `MAX_HOPS`; playbook theo incident type. |

## Lưu ý khi demo

- Highlight trên graph và bảng impact luôn là của **lần chạy gần nhất**; nếu lần chạy lỗi, kết quả cũ được ẩn để không hiển thị dữ liệu cũ như dữ liệu hiện tại.
- Nội dung action theo incident type là playbook tĩnh của backend (ví dụ MACHINE_BREAKDOWN luôn nhắc `EQ_OVEN_01`), chỉ dòng CONTEXT thay đổi theo origin.
