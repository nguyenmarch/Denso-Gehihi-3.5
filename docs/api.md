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
