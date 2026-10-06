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
