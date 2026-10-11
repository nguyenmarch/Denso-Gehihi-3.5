# API hiện tại

Base URL: `http://localhost:8000/api/v1`

## Health

```http
GET /health
```

Trả về `status=ok` khi Neo4j kết nối được, hoặc `status=degraded` khi backend chạy nhưng database chưa sẵn sàng.

## Mô phỏng ảnh hưởng

```http
POST /incidents/simulate
Content-Type: application/json
```

Request:

```json
{
  "node_id": "EQ_OVEN_01",
  "incident_type": "MACHINE_BREAKDOWN",
  "severity": 1.0
}
```

Loại sự cố hiện có:

- `MACHINE_BREAKDOWN`
- `MATERIAL_DEFECT`
- `CYCLE_TIME_SPIKE`

Response gồm node gốc, loại sự cố, các node bị ảnh hưởng, khoảng cách, impact score và hành động theo bộ phận.

Propagation đi theo các quan hệ có hướng `OPERATES_IN`, `FLOWS_TO` và `AFFECTS`, tối đa `MAX_HOPS` hop. `impact_score` được tính theo:

```
severity × DECAY_RATE ^ distance
```

Giá trị trả về được làm tròn đến 3 chữ số thập phân và danh sách được sắp xếp theo `distance`, sau đó theo `node_id`.

Ví dụ response:

```json
{
  "origin_id": "EQ_OVEN_01",
  "incident_type": "MACHINE_BREAKDOWN",
  "impacted_nodes": [
    {
      "node_id": "STEP_REFLOW",
      "node_type": "ProcessStep",
      "name": "Reflow Soldering",
      "distance": 1,
      "impact_score": 0.75
    },
    {
      "node_id": "STEP_AOI",
      "node_type": "ProcessStep",
      "name": "Automated Optical Inspection",
      "distance": 2,
      "impact_score": 0.562
    }
  ],
  "actions_by_department": {
    "DEP_MAINT": "…",
    "DEP_PROD": "…",
    "DEP_QA": "…",
    "DEP_SCM": "…",
    "CONTEXT": "Incident origin: EQ_OVEN_01. …"
  }
}
```

Lỗi ổn định:

| Status | Code | Ý nghĩa |
|---:|---|---|
| `422` | FastAPI validation error | `node_id`, `incident_type` hoặc `severity` không hợp lệ |
| `404` | `node_not_found` | Origin node không tồn tại trong graph |
| `503` | `graph_store_unavailable` | Neo4j không sẵn sàng hoặc query propagation thất bại |

## Topology

```http
GET /graph/topology
GET /graph/node/{node_id}
```

## Root cause

```http
POST /incidents/root-cause
Content-Type: application/json
```

```json
{ "defect_node_id": "STEP_AOI" }
```

## Recommendation

```http
GET /recommendations/{incident_type}
```

## Quy ước lỗi

- Request không hợp lệ trả lỗi validation của FastAPI.
- Node không tồn tại trả `404` ở endpoint chi tiết node.
- Lỗi Neo4j cần hiển thị thành trạng thái degraded, không được giả vờ trả kết quả thật.

## Incident Navigator local demo

Các endpoint dưới đây dùng `X-Demo-Role: operator | technician | expert | admin` để chọn chế độ trình diễn, không phải hệ thống authentication. Mặc định technician. Raw graph từ chối header technician; các API graph cũ vẫn dùng mặc định expert để giữ compatibility.

| Method | Endpoint | Vai trò / contract |
|---|---|---|
| GET | `/api/v1/incidents` | Danh sách work orders được lọc theo vai trò |
| POST | `/api/v1/incidents/fault` | Operator/admin; body giống simulation; incident server tạo có origin synthetic |
| GET | `/api/v1/incidents/{id}` | Work order; operator/expert/admin nhận `node_id`/`simulation` để đánh dấu node lỗi trên graph; technician không nhận |
| POST | `/api/v1/incidents/{id}/dispatch` | Operator/admin; `{assignee?: string}`; alert → dispatched |
| POST | `/api/v1/incidents/{id}/start` | Technician/admin; `{}`; dispatched → in_progress |
| POST | `/api/v1/incidents/{id}/resolve` | Technician/admin; `{report: string}` bắt buộc; in_progress → resolved |
| POST | `/api/v1/incidents/{id}/guidance/explain` | Technician/expert/admin; đã dispatch; deterministic guidance + optional Gemini narrative |
| GET | `/api/v1/demo/audit` | Expert/admin; model, latency_ms, mode, failure_category |
| GET/POST | `/api/v1/demo/learning` | Expert/admin; POST `{incident_id,node_id,note}` cần sự cố đã resolved và node tồn tại |
| GET | `/api/v1/events` | SSE `plant_tick`: `{at,origin:"synthetic"}`; heartbeat của dịch vụ demo |

Fault/dispatch/start/resolve bắt buộc `Idempotency-Key` dài 8–128 ký tự. Retry cùng key/cùng payload trả snapshot response đã lưu; dùng key với payload/path/role khác trả 409. Chuyển state không hợp lệ trả 409; báo cáo trống trả 422. Annotation chỉ do expert nhập và không tự sửa topology/rule.

Guidance response:

```json
{
  "mode": "llm",
  "model": "gemini-3.5-flash",
  "narrative": {
    "summary": "Hướng dẫn cần người phụ trách xem xét.",
    "citations": ["e1"],
    "steps": {"s1": {"text": "Diễn đạt của bước trong playbook.", "citations": ["s1"]}}
  },
  "steps": [{"id": "s1", "text": "Bước deterministic trong playbook."}],
  "evidence": [{"label": "Sự cố được tạo bởi mô phỏng synthetic", "source": "machine_event"}],
  "failure_category": null,
  "failure_reason": null,
  "safety": "Gemini diễn đạt lại hướng dẫn. Containment là đề xuất. Quyết định cuối cùng thuộc người phụ trách."
}
```

Fallback trả `mode=knowledge`, `narrative=null`, giữ nguyên `steps` và kèm taxonomy failure ổn định/lý do tiếng Việt. Không trả provider dumps, stack trace hoặc key. Citation chỉ là alias `s1`, `e1`, không phải graph ID.

`GET /health` giữ nguyên `status`/`database` và thêm:

```json
{
  "capabilities": {
    "synthetic_ingestion": "enabled",
    "optional_ai": "enabled",
    "external_factory_integration": "disabled",
    "control_write": "disabled"
  },
  "dependencies": {
    "ai": {"mode": "gemini", "configured": true, "policy": "external_approved_synthetic"},
    "plant_simulation": "running"
  }
}
```

`configured` chỉ xác nhận có key local, không xác nhận provider reachable. Health không gọi Gemini. `plant_simulation` là khả năng phục vụ heartbeat synthetic khi API đang chạy.
