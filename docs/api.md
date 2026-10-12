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

## Health mở rộng

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

`GET /api/v1/events`: SSE `plant_tick` `{at, origin: "synthetic"}`; heartbeat của dịch vụ demo, không phải số liệu máy.

## Contract demo (PRE-02 — đã triển khai 12/10/2026)

Kịch bản và ID trong ví dụ lấy từ "Kịch bản dự kiến" trong [demo-script.md](demo-script.md). Contract này thay contract demo trước (`X-Demo-Role`, `/resolve`, `/demo/learning` đã bỏ). Hồ sơ lưu theo contract trước vẫn nằm trong store dưới kind `incident` nhưng không được trả ra.

### Nhận diện actor

| Header | Bắt buộc | Ý nghĩa |
|---|---|---|
| `X-Demo-Actor` | Mọi endpoint trong mục này trừ `/demo/actors` | ID actor demo (`op-01`, `tech-01`, `tech-02`, `exp-01`). Backend tra vai trò từ danh sách actor trong `backend/app/core/actors.py`; client không tự khai vai trò. |
| `Idempotency-Key` | Mọi mutation (trigger, fault, dispatch, start, report, lesson, PATCH/accept/reject lesson) | 8–128 ký tự; cùng key + cùng payload trả lại response đã lưu; khác payload trả 409 `idempotency_conflict`. |

Đây là chế độ trình diễn, không phải authentication. `GET /graph/topology` và `/graph/node/{id}` từ chối actor kỹ thuật viên (403); không gửi header thì vẫn đọc được như trước.

```http
GET /api/v1/demo/actors
```

```json
[
  { "id": "op-01", "name": "Điều phối ca A", "role": "operator" },
  { "id": "tech-01", "name": "Kỹ thuật viên 1", "role": "technician" },
  { "id": "tech-02", "name": "Kỹ thuật viên 2", "role": "technician" },
  { "id": "exp-01", "name": "Chuyên gia bảo trì", "role": "expert" }
]
```

### Lỗi chung

Lỗi do backend kiểm tra trả `{"detail": {"code": "...", "message": "...", "fields": {...}?}}`; `message` tiếng Việt, `fields` chỉ có khi lỗi gắn với một trường. Lỗi sai kiểu/thiếu trường ở mức schema giữ định dạng mặc định của FastAPI (`detail` là danh sách có `loc`, `msg`).

| Status | Code | Khi nào |
|---:|---|---|
| 400 | `unknown_actor` | Thiếu hoặc sai `X-Demo-Actor` |
| 403 | `forbidden_role` | Vai trò không được phép thao tác |
| 403 | `not_assignee` | Kỹ thuật viên đọc/thao tác trên việc không giao cho mình |
| 404 | `incident_not_found`, `scenario_not_found`, `lesson_not_found`, `node_not_found` | Không tồn tại |
| 409 | `invalid_transition` | Trạng thái hiện tại không cho phép thao tác |
| 409 | `report_required` | Đề xuất bài học khi sự cố chưa có report |
| 409 | `idempotency_conflict` | Key đã dùng cho payload khác |
| 422 | `validation_error` | Vi phạm quy tắc nghiệp vụ của trường, kèm `fields` |
| 422 | `origin_type_mismatch` | Loại node origin không hợp loại sự cố |
| 503 | `graph_store_unavailable` | Neo4j lỗi; không trả kết quả giả |

### Kịch bản và tạo incident (BE-02)

```http
GET  /api/v1/scenarios
POST /api/v1/scenarios/{scenario_id}/trigger      # operator
POST /api/v1/incidents/fault                      # operator; body như /incidents/simulate
GET  /api/v1/incidents
GET  /api/v1/incidents/{id}
```

Kịch bản đọc từ node `MachineEvent` đã seed (`SCN_OVEN_TEMP`, `SCN_PACK_JAM`). Mỗi event chỉ sinh một incident: trigger lại trả `200` với incident đã có thay vì `201`.

```json
{
  "id": "inc-…",
  "origin": "synthetic",
  "source": "scenario",
  "scenario_id": "SCN_OVEN_TEMP",
  "event": { "id": "EVT_OVEN_TEMP_0820", "at": "2026-10-05T08:20:00+07:00", "label": "Lệch nhiệt độ vùng gia nhiệt" },
  "asset": { "id": "EQ_OVEN_01", "type": "Equipment", "name": "Reflow Oven Alpha" },
  "incident_type": "MACHINE_BREAKDOWN",
  "severity": 1.0,
  "alarm_at": "2026-10-05T08:20:00+07:00",
  "state": "alert",
  "created_at": "…",
  "created_by": "op-01",
  "assignee": null,
  "decision_note": null,
  "next_step": null,
  "reports": [],
  "history": [{ "at": "…", "actor_id": "op-01", "action": "create", "from": null, "to": "alert", "note": null }],
  "simulation": { "origin_id": "EQ_OVEN_01", "impacted_nodes": [], "actions_by_department": {} }
}
```

- `simulation` là propagation heuristic để đánh dấu graph; chỉ điều phối và chuyên gia nhận.
- `/incidents/fault` lấy `alarm_at` bằng thời điểm tạo và kiểm tra loại origin:

| incident_type | Loại origin hợp lệ |
|---|---|
| `MACHINE_BREAKDOWN` | `Equipment` |
| `CYCLE_TIME_SPIKE` | `Equipment` |
| `MATERIAL_DEFECT` | `ProcessStep`, `Batch` |

`POST /incidents/simulate` (what-if) không đổi. `GET /incidents` trả `[]` khi chưa có incident; kỹ thuật viên chỉ nhận incident giao cho mình.

### Trạng thái incident và chuyển trạng thái (BE-03)

| Từ | Thao tác | Actor | Sang | Payload |
|---|---|---|---|---|
| `alert`, `unresolved` | `POST /incidents/{id}/dispatch` | operator | `dispatched` | `assignee_id` (kỹ thuật viên), `decision_note` (1–1000 ký tự) |
| `dispatched` | `POST /incidents/{id}/start` | assignee | `in_progress` | `{}` |
| `in_progress` | `POST /incidents/{id}/report` | assignee | `resolved` hoặc `unresolved` | xem dưới |

```json
{
  "checks": [{ "text": "Đo thermocouple vùng 3", "result": "Sai lệch 12°C" }],
  "actions": ["Thay SSR vùng 3"],
  "outcome": "not_fixed",
  "summary": "Chờ thermocouple thay thế",
  "next_step": "Lắp thermocouple mới khi kho xác nhận",
  "open_items": ["Xác minh profile nhiệt sau sửa"]
}
```

- `outcome`: `fixed` → `resolved`; `not_fixed` → `unresolved` và `next_step` của incident được cập nhật.
- `next_step` bắt buộc khi `not_fixed`; thiếu thì trả 422 với `fields.next_step`.
- Mỗi report lưu `index`, `at`, `actor_id`.
- Mỗi chuyển trạng thái thêm một mục history có `actor_id`, `action`, `from`, `to`, `note`.
- Kết quả sửa máy không thay đổi tác động của lô.

### Tác động (BE-04)

```http
GET /api/v1/incidents/{id}/impact
```

```json
{
  "incident_id": "inc-…",
  "rule": "suspect_window_v1",
  "status": "evaluated",
  "window": { "start": "2026-10-05T07:30:00+07:00", "start_basis": "CHK_OVEN_0730", "end": null, "end_basis": "Chưa ghi nhận thời điểm cô lập thiết bị" },
  "items": [
    { "object_id": "BATCH_2026_001", "object_type": "Batch", "name": "Production Batch 001", "product_code": "PRD-A", "category": "affected",
      "reasons": [{ "code": "in_equipment_at_alarm", "text": "Đang xử lý tại thiết bị lúc alarm (bắt đầu 05/10 07:50)", "refs": ["REC_REFLOW_001"] }],
      "verification": "needs_verification" },
    { "object_id": "BATCH_2026_003", "object_type": "Batch", "name": "Production Batch 003", "product_code": "PRD-A", "category": "unaffected",
      "reasons": [{ "code": "before_last_good_check", "text": "Kết thúc 05/10 07:20, trước kiểm tra đạt 05/10 07:30", "refs": ["REC_REFLOW_003", "CHK_OVEN_0730"] },
                  { "code": "inspection", "text": "Kiểm tra PASS lúc 05/10 07:45", "refs": ["AOI_003"] }],
      "scope_note": "Chỉ xét sự cố của thiết bị này" },
    { "object_id": "BATCH_2026_004", "object_type": "Batch", "name": "Production Batch 004", "product_code": "PRD-A", "category": "unknown",
      "reasons": [{ "code": "missing_end_time", "text": "Bắt đầu 05/10 07:10, trước kiểm tra đạt; thiếu thời điểm kết thúc", "refs": ["REC_REFLOW_004"] }],
      "verification": "needs_verification", "next_check": "Xác minh record xử lý; giữ bảo thủ đến khi rõ" }
  ],
  "propagation": { "basis": "heuristic_hops", "impacted_nodes": [] },
  "upstream_candidates": { "basis": "investigation_only", "nodes": [] }
}
```

- Mã lý do:
  - `affected`: `in_equipment_at_alarm`, `processed_in_window`.
  - `unaffected`: `before_last_good_check`, `not_yet_processed`.
  - `unknown`: `no_good_check`, `missing_end_time`, `missing_times`, `missing_record`, `location_unknown`.
- Thiếu dữ liệu luôn trả `unknown`, không bao giờ `unaffected`.
- Origin không phải `Equipment` trả `status: "not_applicable"`, `items: []` và `message`; nghĩa là phạm vi chưa xác định, không phải không ảnh hưởng.
- Kỹ thuật viên nhận `items` nhưng không nhận `propagation` và `upstream_candidates`.

### Hướng dẫn và trợ lý (BE-05, BE-06)

```http
GET  /api/v1/incidents/{id}/guidance             # operator, expert, assignee
POST /api/v1/incidents/{id}/guidance/explain     # expert, assignee; incident đã giao việc
POST /api/v1/incidents/{id}/assistant/ask        # assignee
```

Guidance chọn theo cặp (tài sản, loại sự cố) trong `CONTEXT_GUIDANCE` (`backend/app/models/playbooks.py`). Mã graph trong bước được thay bằng tên thiết bị.

```json
{
  "match": { "asset_id": "EQ_OVEN_01", "incident_type": "MACHINE_BREAKDOWN", "source": "playbook:EQ_OVEN_01/MACHINE_BREAKDOWN" },
  "steps": [{ "id": "s1", "text": "Isolate Reflow Oven Alpha safely; verify heater, SSR, thermocouple and insulation; record repair evidence." }],
  "containment": { "status": "proposal", "human_review_required": true, "text": "…" },
  "lessons": [{ "id": "les-…", "text": "…", "source_incident_id": "inc-…", "accepted_by": "exp-01", "accepted_at": "…" }],
  "gap": null
}
```

Không có mục phù hợp:

```json
{ "match": null, "steps": [], "containment": null, "lessons": [], "gap": { "code": "knowledge_gap", "message": "Chưa có hướng dẫn cho Packaging Cell 01 / MACHINE_BREAKDOWN." } }
```

Explain giữ response như trước (`mode`, `model`, `narrative`, `steps`, `evidence`, `failure_category`, `failure_reason`, `safety`).

- Context gửi Gemini chỉ gồm:
  - các bước playbook;
  - bài học `accepted` (đã che mã graph);
  - evidence do server dựng: `e1` là event, `e2` là tóm tắt số lô theo loại tác động.
- Không gửi report, mã graph hay propagation.
- Ask nhận `{ "question": "…" }` (1–500 ký tự) và trả:

```json
{ "mode": "llm", "model": "gemini-3.5-flash", "answer": "…", "citations": [{ "alias": "s1", "label": "Bước 1" }, { "alias": "l1", "label": "Bài học 1" }],
  "safety": "…", "failure_category": null, "failure_reason": null }
```

- Narrative và answer chỉ được trích dẫn `s*`, `l*`, `e*` có trong context.
- Output chứa mã graph, URL, key hoặc câu khẳng định quyết định bị từ chối (`schema_violation`).
- Provider trả 429/500/502/503/504 được thử lại tối đa 3 lần, cách 1 giây rồi 2 giây, trong giới hạn `INAV_LLM_TIMEOUT`.
- Context không có bước và bài học nào trả `failure_category: "no_guidance"` mà không gọi Gemini.
- Mọi lần gọi ghi audit (`GET /api/v1/demo/audit`, chỉ chuyên gia) với `kind` (`explain`/`ask`), `model`, `latency_ms`, `attempts`, `mode`, `failure_category`.

### Bài học (BE-07)

| Từ | Thao tác | Actor | Sang |
|---|---|---|---|
| — | `POST /incidents/{id}/lessons` `{text}` | assignee, sau khi đã có report | `pending` |
| `pending` | `PATCH /lessons/{id}` `{text}` | expert | `pending` (giữ `original_text`) |
| `pending` | `POST /lessons/{id}/accept` `{}` | expert | `accepted` |
| `pending` | `POST /lessons/{id}/reject` `{reason}` | expert | `rejected` |

```http
GET /api/v1/lessons?status=pending|accepted|rejected     # expert
```

```json
{
  "id": "les-…", "status": "pending", "text": "…", "original_text": "…", "created_at": "…",
  "context": { "asset_id": "EQ_OVEN_01", "incident_type": "MACHINE_BREAKDOWN" },
  "source": { "incident_id": "inc-…", "report_index": 0, "author_id": "tech-01" },
  "review": null
}
```

- Ngữ cảnh của bài học lấy từ incident nguồn.
- Chỉ bài học `accepted` mới xuất hiện trong guidance của incident cùng ngữ cảnh.
- Bài học đã xem xét không sửa hoặc duyệt lại được (409).
- Tạo bài học là request riêng, nên lỗi ở bước này không ảnh hưởng report đã lưu.

### Máy: tín hiệu và nhật ký bất thường

Chỉ đọc, mọi actor hợp lệ đều gọi được. Không cần Neo4j: danh mục máy và tín hiệu nằm trong `backend/app/models/machines.py`, khớp với các node `Equipment` trong seed.

```http
GET /api/v1/machines                                  # thẻ máy: trạng thái, giá trị hiện tại, sparkline 15 phút
GET /api/v1/machines/{id}/telemetry?minutes=15|60|120 # chuỗi tín hiệu (5–120 phút, tối đa 720 điểm)
GET /api/v1/machines/{id}/events?limit=100            # nhật ký bất thường, mới nhất trước
```

```json
{
  "id": "EQ_OVEN_01:temperature:1791000046", "machine_id": "EQ_OVEN_01", "kind": "threshold",
  "signal": "temperature", "label": "Nhiệt độ vùng gia nhiệt", "unit": "°C",
  "level": "critical", "current_level": "warning", "threshold": 245.0, "peak": 252.6,
  "started_at": "…", "ended_at": null, "incident_ids": ["inc-…"]
}
```

Luồng dữ liệu:

1. Operator tạo incident (kịch bản hoặc gây lỗi thủ công) như trước. Từ `created_at`, lỗi tác động lên tín hiệu của máy đó:
   - `SCN_OVEN_TEMP`: nhiệt độ lò tăng dần.
   - `SCN_PACK_JAM` và `MACHINE_BREAKDOWN`: máy dừng, không có giá trị sản xuất.
   - `CYCLE_TIME_SPIKE`: cycle time tăng vọt.
   - Mức độ của sự cố (severity) quyết định độ lệch.
2. Bộ phát hiện chỉ đọc tín hiệu. Một mức phải giữ 3 mẫu liên tiếp (6 giây) mới mở hoặc đóng bất thường; muốn hạ mức, giá trị phải xuống dưới ngưỡng một khoảng `hyst`. Mỗi bất thường được gắn với các incident đang tác động lên đúng kênh tín hiệu đó.
3. Khi technician báo `fixed`, lỗi hết tác động: máy chạy lại ngay, còn giá trị lệch giảm về trong nửa thời gian tăng. Báo `not_fixed` thì máy vẫn lệch.

- `MATERIAL_DEFECT` (gốc là công đoạn hoặc lô) không tác động lên dữ liệu máy.
- Không có bất thường ngẫu nhiên: máy chỉ lệch khi có incident.
- Mẫu tín hiệu là hàm xác định của (máy, thời điểm, incident) nên giữ nguyên sau khi khởi động lại. Backend dựng lại 2 giờ gần nhất trong bộ nhớ; nhật ký bất thường được lưu vào store demo (`machine_event`), và bất thường đang mở được nối tiếp thay vì mở lại.
