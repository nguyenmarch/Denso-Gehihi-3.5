# Kiến trúc

## Luồng chính

```text
Người dùng chọn node + loại sự cố + severity
        ↓
React gọi POST /incidents/simulate
        ↓
FastAPI đọc quan hệ trong Neo4j
        ↓
PropagationService tính impact theo khoảng cách
RecommendationService lấy playbook
        ↓
React hiển thị graph, node bị ảnh hưởng và hành động
```

## Backend

- `app/main.py`: tạo FastAPI, CORS, health check.
- `app/api/v1/`: các route incident, graph, recommendation.
- `app/services/propagation_service.py`: truy vấn quan hệ và tính điểm ảnh hưởng.
- `app/services/root_cause_service.py`: truy vết quan hệ nguyên nhân.
- `app/services/recommendation_service.py`: lấy playbook theo loại sự cố.
- `app/core/database.py`: kết nối Neo4j.
- `app/schemas/`: request/response DTO.

## Frontend

- `App.tsx`: màn hình command center và trạng thái mô phỏng.
- `IncidentTrigger.tsx`: nhập node, incident type và severity.
- `GraphCanvas.tsx`: hiển thị topology bằng Cytoscape.
- `ActionMatrix.tsx`: hiển thị hành động theo bộ phận.
- `services/api.ts`: REST client.

## Công thức

```text
impact_score = severity × DECAY_RATE ^ distance
```

Mặc định `DECAY_RATE=0.75`, `MAX_HOPS=4`.

## Nguyên tắc phát triển

- Không thêm tích hợp nhà máy thật khi chưa có data contract được duyệt.
- Không biến recommendation thành lệnh điều khiển máy.
- Mọi mở rộng phải có test backend và cập nhật API docs.

## Lưu trữ và luồng demo (PRE-02 — đã triển khai 12/10/2026)

| Dữ liệu | Nơi lưu | Ghi bởi |
|---|---|---|
| Topology, lô (`product_code`), record xử lý `PROCESSED_ON`/`INSPECTED_ON`, `ProfileCheck`, `MachineEvent` (kịch bản) | Neo4j, nạp bằng seed `MERGE` trong `backend/data/` | Chỉ seed; API chỉ đọc |
| Hướng dẫn theo (tài sản, loại sự cố) | `backend/app/models/playbooks.py` (`CONTEXT_GUIDANCE`) | Code |
| Actor demo | `backend/app/core/actors.py` | Code |
| Incident (`incident_v2`), history có actor, report, command idempotency, audit LLM | SQLite `.data/demo.sqlite3` | API workflow |
| Bài học và review (pending/accepted/rejected) | SQLite, cùng store | API lesson |

- `app/services/impact_service.py`: quy tắc `suspect_window_v1`. Tác động được tính lại từ Neo4j mỗi lần đọc, không lưu vào graph.
- `app/services/recommendation_service.py`: chọn hướng dẫn theo ngữ cảnh. Không có ngữ cảnh phù hợp thì trả knowledge gap.
- `app/services/guidance_service.py`: gọi Gemini để diễn đạt (explain) và hỏi đáp (ask), có guard, retry, validate và audit.
- Không có API nào ghi vào Neo4j. Graph editor và version control tri thức đầy đủ vẫn là phần mở rộng.
- Mutation workflow và bản ghi idempotency được commit trong cùng một transaction SQLite.
- Frontend:
  - `IncidentBoard` / `IncidentDetail`: danh sách và hồ sơ sự cố theo actor;
  - `LessonReview`: chuyên gia duyệt bài học;
  - actor đang chọn lưu trong `localStorage`; hồ sơ đang mở lưu trong URL (`?incident=`).
