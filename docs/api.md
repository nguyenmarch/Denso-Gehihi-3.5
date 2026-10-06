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
