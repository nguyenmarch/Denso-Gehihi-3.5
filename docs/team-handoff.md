# Phân công team và handoff

## Mục tiêu MVP

```text
React → FastAPI → Neo4j
```

Người dùng chọn node và loại sự cố, hệ thống tính propagation, hiển thị graph bị ảnh hưởng và trả về playbook hành động.

## Deadline đề xuất

| Mốc | Hạn |
|---|---:|
| Chốt contract chung | 06/10/2026 |
| A/B/C hoàn thành phần riêng | 08/10/2026 |
| Ghép và test end-to-end | 09/10/2026 |
| Sửa lỗi MVP | 12/10/2026 |
| D audit và merge cuối | 13/10/2026 |

## A — Logic propagation

Chỉ tập trung vào logic xác định phạm vi ảnh hưởng.

### 3 việc phải làm

1. Hoàn thiện `PropagationService`:
   - truy vấn các node downstream;
   - giới hạn `MAX_HOPS`;
   - tính:

     ```text
     impact_score = severity × DECAY_RATE ^ distance
     ```

2. Hoàn thiện input/output contract cho `POST /incidents/simulate`:
   - validate `node_id`;
   - validate `incident_type`;
   - validate `severity`;
   - response ổn định cho frontend.

3. Viết test cho propagation:
   - distance 1, 2, 3;
   - severity khác nhau;
   - vượt quá max hops;
   - node không tồn tại;
   - incident type không hợp lệ.

### File phụ trách

```text
backend/app/services/propagation_service.py
backend/app/schemas/incident.py
backend/app/api/v1/incidents.py
backend/tests/test_services.py
backend/tests/test_api.py
```

### Đầu ra

- PR `feature/propagation`.
- Test command và kết quả test.
- Ví dụ request/response gửi cho B và C.

### Acceptance criteria

- Công thức và max hops đúng.
- Kết quả deterministic với cùng dữ liệu Neo4j.
- Không trả raw Neo4j object.
- Không thay đổi response contract sau khi B bắt đầu nối frontend.

## B — Neo4j graph

Chỉ tập trung vào dữ liệu, schema và topology trong Neo4j.

### 3 việc phải làm

1. Hoàn thiện migration và seed:
   - constraints/indexes;
   - process/equipment/batch/incident nodes;
   - các relation cần cho propagation.

2. Hoàn thiện graph API:
   - `GET /api/v1/graph/topology`;
   - `GET /api/v1/graph/node/{node_id}`;
   - response node/edge rõ ràng, ổn định.

3. Kiểm tra chất lượng graph:
   - seed chạy lại không tạo duplicate;
   - node ID duy nhất;
   - relation downstream đúng hướng;
   - kiểm tra Neo4j unavailable và lỗi query.

### File phụ trách

```text
backend/data/
backend/app/core/database.py
backend/app/api/v1/graph.py
backend/app/schemas/graph.py
```

### Đầu ra

- PR `feature/neo4j-graph`.
- Hướng dẫn migration/seed.
- Danh sách node ID dùng trong demo, ví dụ `EQ_OVEN_01`, `STEP_AOI`.
- Screenshot hoặc Cypher output chứng minh topology.

### Acceptance criteria

- Database sạch có thể seed thành công.
- Seed lần hai không tạo duplicate.
- Topology API trả được nodes và edges.
- Các node dùng trong propagation tồn tại đúng trong graph.

## C — Frontend và integration

Chỉ tập trung vào việc nối UI với API và chạy demo.

### 3 việc phải làm

1. Nối topology thật:
   - gọi `/graph/topology`;
   - render graph bằng Cytoscape;
   - highlight node bị ảnh hưởng.

2. Nối simulation flow:
   - chọn node;
   - chọn incident type;
   - nhập severity;
   - gọi `/incidents/simulate`;
   - hiển thị impact và action matrix.

3. Hoàn thiện trạng thái và kiểm tra demo:
   - loading;
   - backend error;
   - empty state;
   - simulation success;
   - chạy được luồng demo từ đầu đến cuối.

### File phụ trách

```text
frontend/src/App.tsx
frontend/src/components/
frontend/src/services/api.ts
frontend/src/types/index.ts
frontend/src/app.css
```

### Đầu ra

- PR `feature/frontend-integration`.
- Screenshot topology và simulation result.
- Kết quả `npm run build`.
- Demo script tối đa 5 phút.

### Acceptance criteria

- UI dùng dữ liệu API thật, không dùng topology giả.
- Kết quả UI khớp response của A.
- Lỗi không làm blank page.
- Frontend build thành công.

## D — Merge và audit

D là người merge code và audit cuối. D không nhận feature mới trong sprint này.

### 3 việc phải làm

1. Review và merge theo thứ tự:

   ```text
   B: Neo4j graph
   → A: propagation logic
   → C: frontend/integration
   ```

2. Chạy audit kỹ thuật:

   ```bash
   PYTHONPATH=backend pytest -q backend/tests
   cd frontend && npm run build
   ```

   Kiểm tra thêm:
   - không có secret;
   - API contract không bị phá;
   - seed không duplicate;
   - UI không hiển thị dữ liệu giả như dữ liệu thật.

3. Chạy demo cuối và quyết định release:
   - pass: merge/release candidate;
   - fail: trả PR về đúng owner;
   - limitation: ghi vào issue hoặc `docs/limitations.md`.

### Quy tắc merge

- Mỗi người làm một branch riêng.
- PR phải có test/build result.
- Không merge khi còn blocker.
- Không tự ý mở rộng scope sang simulator realtime, LLM, authentication hoặc factory integration.
- Mọi breaking change phải được A, B, C thống nhất trước khi D merge.

## Handoff bắt buộc

Mỗi PR dùng mẫu ngắn này:

```text
Owner:
PR/branch:
Đã hoàn thành:
File chính:
Test/build đã chạy:
Kết quả:
Known issue:
Cần người tiếp theo làm:
```

## Definition of Done

- Neo4j seed được graph sạch và đúng relation.
- Propagation trả impact score đúng công thức.
- Frontend chạy được topology → simulation → result.
- Backend test và frontend build có kết quả.
- D hoàn tất audit và merge code.
