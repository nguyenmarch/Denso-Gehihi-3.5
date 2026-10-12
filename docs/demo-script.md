# Demo script

## Kịch bản dự kiến (PRE-01 — đã chốt và triển khai 12/10/2026)

Cột "Kỳ vọng" được viết từ quy tắc trước khi viết engine; kết quả thực tế ghi ở mục "Biên bản chạy INT-01". Mọi dữ liệu là nhà máy giả lập, không phải số liệu DMVN.

### Ca chính: lò reflow lệch nhiệt, xác định lô cần giữ và giao sửa máy

Chuyền giả lập hiện có: `STEP_PASTE → STEP_SMT → STEP_REFLOW → STEP_AOI → STEP_PACK`. Sự kiện: `EQ_OVEN_01` (Reflow Oven Alpha) báo lệch nhiệt độ vùng gia nhiệt so với profile lúc 08:20 ngày 2026-10-05 (giờ +07:00, dữ liệu giả lập).

| Trách nhiệm (vai trò demo) | Actor demo đề xuất | Được thao tác |
|---|---|---|
| Điều phối (`operator`) | `op-01` — Điều phối ca A | Kích hoạt ca demo, xem tác động, ghi quyết định, giao việc / giao lại khi chưa khắc phục |
| Xử lý (`technician`) | `tech-01`, `tech-02` — Kỹ thuật viên 1, 2 | Xem việc được giao cho mình, nhận việc, xem hướng dẫn, hỏi trợ lý, ghi kiểm tra/thao tác/kết quả, đề xuất bài học |
| Xác nhận tri thức (`expert`) | `exp-01` — Chuyên gia bảo trì | Xem nguồn bài học, sửa, chấp nhận, từ chối; xem graph tri thức |

Hành trình (thời lượng mục tiêu 5–7 phút):

| # | Actor | Thao tác | Kỳ vọng |
|---|---|---|---|
| 1 | op-01 | Kích hoạt kịch bản `SCN_OVEN_TEMP` | Incident mới ở trạng thái `alert`, gắn event `EVT_OVEN_TEMP_0820`, tài sản `EQ_OVEN_01`, loại `MACHINE_BREAKDOWN`. Kích hoạt lại không tạo incident thứ hai. |
| 2 | op-01 | Mở tác động | `BATCH_2026_001` **affected**, `BATCH_2026_003` **unaffected**, `BATCH_2026_004` **unknown**, `BATCH_2026_002` **unaffected (chưa qua lò)**; mỗi dòng có lý do và record tham chiếu (bảng kỳ vọng bên dưới). |
| 3 | op-01 | Ghi quyết định, giao `tech-01` | Trạng thái `dispatched`, history ghi actor `op-01`, assignee `tech-01`, ghi chú quyết định. |
| 4 | tech-01 | Mở danh sách việc của mình, nhận việc | `in_progress`; tech-02 không thấy/không nhận được việc này. |
| 5 | tech-01 | Xem hướng dẫn | Hướng dẫn cho đúng `EQ_OVEN_01` (heater, SSR, thermocouple), có nguồn/rule chọn; LLM diễn đạt lại, nhãn rõ. |
| 6 | tech-01 | Hỏi trợ lý "Nên kiểm tra gì trước?" | Câu trả lời có tham chiếu bước/evidence của incident này; lỗi provider có fallback và lý do. |
| 7 | tech-01 | Ghi kiểm tra, kết quả **chưa khắc phục** (chờ linh kiện), bước tiếp theo | `unresolved`; bước tiếp theo hiển thị cho op-01; các lô affected/unknown vẫn ở trạng thái cần xác minh. |
| 8 | op-01 | Giao lại `tech-01` sau khi có linh kiện | `dispatched` → tech-01 nhận → ghi kết quả **đã khắc phục** → `resolved`. Lô affected/unknown **không** tự được giải phóng. |
| 9 | tech-01 | Đề xuất bài học từ report | Bài học `pending`, liên kết incident/report/tác giả. |
| 10 | exp-01 | Mở nguồn, sửa câu chữ, chấp nhận | `accepted`, ghi người xác nhận và thời gian. |
| 11 | op-01 → tech-02 | Tạo sự cố mới cùng ngữ cảnh (`EQ_OVEN_01`, `MACHINE_BREAKDOWN`) bằng nút gây lỗi, giao tech-02 | Hướng dẫn của incident mới có mục "Bài học đã xác nhận" kèm nguồn incident cũ. |
| 12 | bất kỳ | Reload trình duyệt / restart backend | Hồ sơ, assignee, report, history, review còn nguyên. |

### Quy tắc tác động đề xuất (BE-04)

- Cửa sổ nghi ngờ bắt đầu ở lần kiểm tra profile nhiệt **đạt** gần nhất của thiết bị trước alarm; kết thúc khi thiết bị được cô lập (mặc định: còn mở).
- Lô có record xử lý tại thiết bị:
  - kết thúc trước đầu cửa sổ → `unaffected`;
  - giao với cửa sổ → `affected`;
  - thiếu thời điểm khiến không xác định được giao hay không → `unknown`.
- Lô không có record tại thiết bị và đang ở công đoạn phía trước → `unaffected` với lý do "chưa qua thiết bị"; vị trí không xác định → `unknown`.
- Lô đang được xử lý tại thiết bị đúng thời điểm alarm → `affected` trong mọi trường hợp.
- Không có lần kiểm tra profile đạt nào → các lô còn lại có record tại thiết bị là `unknown`.
- Thiếu dữ liệu không bao giờ được xếp `unaffected`. Score theo hop giữ làm phần giải thích lan truyền (heuristic); upstream traversal chỉ là ứng viên điều tra.

### Dữ liệu BE cần seed (BE-01, giả lập)

| ID | Loại | Dữ liệu chính |
|---|---|---|
| `CHK_OVEN_0730` | Kiểm tra profile nhiệt | `EQ_OVEN_01`, 07:30, kết quả `PASS` |
| `EVT_OVEN_TEMP_0820` | Event máy | `EQ_OVEN_01`, 08:20, lệch nhiệt độ vùng gia nhiệt |
| `BATCH_2026_001` (đã có) | Lô | Record reflow `EQ_OVEN_01` 07:50–08:35 |
| `BATCH_2026_002` (đã có) | Lô | Đang ở `STEP_SMT`, chưa có record reflow |
| `BATCH_2026_003` (mới) | Lô | Record reflow 06:40–07:20; AOI `PASS` 07:45 |
| `BATCH_2026_004` (mới) | Lô | Record reflow bắt đầu 07:10, **thiếu** thời điểm kết thúc |
| Sản phẩm của lô | Sản phẩm | Một mã sản phẩm giả lập cho mỗi lô (nếu chốt dùng tầng sản phẩm) |
| Hướng dẫn | Tri thức | Playbook hiện có gắn với cặp (`EQ_OVEN_01`, `MACHINE_BREAKDOWN`), (`EQ_AOI_01`, `CYCLE_TIME_SPIKE`), (`STEP_SMT`, `MATERIAL_DEFECT`); không có mục cho `EQ_PACK_01` |
| Actor demo | Persona | `op-01`, `tech-01`, `tech-02`, `exp-01` |

Seed cũ (19 node / 31 quan hệ) được giữ; dữ liệu mới thêm bằng `MERGE` (tổng 24 node / 40 quan hệ), chạy lần hai không trùng.

### Ca đối lập và ca kiểm tra (mục 9 handoff)

| Ca | Điều kiện | Kỳ vọng theo quy tắc |
|---|---|---|
| Có căn cứ không ảnh hưởng | `BATCH_2026_003` kết thúc reflow 07:20, trước kiểm tra đạt 07:30 | `unaffected`; lý do nêu `CHK_OVEN_0730` và record reflow; phạm vi kết luận chỉ là lỗi nhiệt của lò, việc sửa máy vẫn cần |
| Thiếu dữ liệu | `BATCH_2026_004` thiếu thời điểm kết thúc reflow | `unknown`; lý do "thiếu thời điểm kết thúc"; bước tiếp theo: xác minh record / giữ bảo thủ |
| Đổi evidence | Bỏ `CHK_OVEN_0730` khỏi fixture test | `BATCH_2026_003` chuyển `unknown`; `BATCH_2026_001` vẫn `affected` vì đang trong lò lúc alarm (test backend, không chạy trên data demo) |
| Sai context | Kịch bản `SCN_PACK_JAM`: `EQ_PACK_01`, `MACHINE_BREAKDOWN` | Hướng dẫn trả **knowledge gap**, không có bước heater lò |
| Sai loại origin | Tạo sự cố `MACHINE_BREAKDOWN` với origin `BATCH_2026_001` | 422 `origin_type_mismatch`, không tạo incident |

### Số đo nghiệp vụ đề xuất

**Thời gian từ alarm đến quyết định giao việc có căn cứ**: từ `created_at` của incident đến mục history `dispatched` đầu tiên, đọc từ API history. Ghi riêng thời gian chờ API (latency impact/guidance trong audit) và thời gian thao tác của người. Chưa có baseline cùng input nên chỉ báo thời gian quan sát, không ghi phần trăm cải thiện.

### Phác bố cục

```text
Điều phối                          Kỹ thuật viên                    Chuyên gia
┌ Danh sách incident ┐┌ Chi tiết ┐  ┌ Việc của tôi ┐┌ Work order ┐   ┌ Bài học pending ┐┌ Nguồn ┐
│ alert / unresolved ││ Tác động │  │ dispatched   ││ Hướng dẫn  │   │ accepted/rejected││report │
│ ...                ││ Graph    │  │ in_progress  ││ Trợ lý     │   └──────────────────┘│incident│
└────────────────────┘│ Giao việc│  └──────────────┘│ Report     │   ┌ Graph tri thức ┐  └───────┘
                      │ History  │                  │ Tác động   │   └────────────────┘
                      └──────────┘                  └────────────┘
```

Layout chi tiết do FE quyết định.

### Quyết định

Đã có trong repo, giữ nguyên: chuyền 5 công đoạn giả lập, Neo4j cho topology, SQLite cho workflow, Gemini chỉ diễn đạt/đề xuất, không có đường điều khiển máy.

Chốt ngày 12/10/2026. Người phụ trách repo giao Claude tự quyết định; người phụ trách demo có thể đổi lại.

1. Một incident chính chứa cả ba loại affected/unaffected/unknown.
2. `X-Demo-Actor` thay `X-Demo-Role`. Vai trò admin bị bỏ. Danh sách actor nằm trong `backend/app/core/actors.py`.
3. Kiểm tra loại origin chỉ áp dụng khi tạo incident; mô phỏng what-if giữ tự do.
4. `/report` (`fixed` / `not_fixed`) thay `/resolve`.
5. Bài học (`lesson`) thay ghi chú expert `/demo/learning`.
6. Bài học đã chấp nhận và câu hỏi của kỹ thuật viên (tối đa 500 ký tự) được gửi tới Gemini theo policy `external_approved_synthetic`. Mã graph trong bài học bị che; UI nhắc chỉ nhập dữ liệu synthetic.
7. Mã sản phẩm là thuộc tính `product_code` của lô. Không làm dữ liệu vật tư/vị trí kho (limitation).
8. Dùng số đo ở trên.
9. Hướng dẫn giữ trong `backend/app/models/playbooks.py` (`CONTEXT_GUIDANCE`), không chuyển vào Neo4j.

### Biên bản chạy INT-01 (12/10/2026)

Revision: working tree chưa commit, dựa trên `571a58e`. Môi trường: Windows, Neo4j `incident_neo4j` (seed 24 node / 40 quan hệ), Python `.venv`.

| Lệnh / thao tác | Kết quả thực tế |
|---|---|
| `npm test` | 75 passed |
| `node scripts/seed.py` chạy 2 lần | 24 node / 40 quan hệ cả hai lần; mỗi lô có đúng một `PROCESSED_ON` |
| `npm run demo` (local, không có key) | Qua 4 nhóm kiểm tra: trigger idempotent theo event; tác động khớp kỳ vọng; giao → chưa khắc phục → giao lại → khắc phục; bài học được dùng lại; máy đóng gói trả knowledge gap; topology không đổi. Guidance `mode=knowledge` (`disabled`) |
| Cùng script trong container backend có key, `INAV_REQUIRE_LIVE=1` | Như trên; explain và ask đều `mode=llm`, exit 0 |
| `scripts/ui_smoke.mjs` trên backend :8001 (store tạm) + Vite :5175 | 29/29 kiểm tra pass, không có lỗi JavaScript. Hành trình 1–12 ở trên đi qua trình duyệt; narrative/answer ở nhánh fallback vì backend tạm không có key |

Kỳ vọng tác động (bảng "Ca đối lập") khớp kết quả thực tế: `BATCH_2026_001` affected, `002` và `003` unaffected, `004` unknown.

Chưa chạy: đo số đo nghiệp vụ trên một buổi trình diễn có người thao tác; rehearsal toàn bộ qua trình diễn trực tiếp (INT-03).

## Script propagation cũ (≤ 5 phút)

Luồng chính hiện tại là "Kịch bản dự kiến" ở trên; script dưới đây chỉ còn cho phần mô phỏng what-if.

Luồng: **topology → simulation → impact + action matrix → empty/error state**. Mọi số liệu trên UI lấy từ API thật (`/graph/topology`, `/incidents/simulate`, `/health`); không có dữ liệu giả.

### Chuẩn bị (trước khi demo)

```bash
docker compose up -d neo4j
docker exec -i incident_neo4j cypher-shell -u neo4j -p incidentpassword123 < backend/data/migrations/001_init_constraints.cypher
docker exec -i incident_neo4j cypher-shell -u neo4j -p incidentpassword123 < backend/data/seed_scenarios.cypher

cd backend && PYTHONPATH=. uvicorn app.main:app --port 8000      # terminal 1
cd frontend && npm install && npm run dev                          # terminal 2 → http://localhost:5173
```

Kiểm tra nhanh: sidebar hiện **Backend & Neo4j đã kết nối**, KPI **Node trong graph = 24**, **Quan hệ = 40**.
Nếu backend không ở `localhost:8000`, đặt `VITE_API_BASE=http://<host>:<port>/api/v1` trong `frontend/.env.local`.

### Kịch bản

| Thời gian | Thao tác | Kết quả cần thấy |
|---|---|---|
| 0:00–0:45 | Giới thiệu topology. | Dây chuyền 5 bước từ trái sang phải (Paste → SMT → Reflow → AOI → Pack). Equipment ở dưới, Batch/IncidentEvent ở trên, Department ở hàng cuối. Cạnh liền = quan hệ propagation (`OPERATES_IN`, `FLOWS_TO`, `AFFECTS`), cạnh đứt = quan hệ khác. |
| 0:45–2:00 | Chọn card **Hỏng máy** (`EQ_OVEN_01`), mức độ **1.0**, bấm **Chạy mô phỏng**. | Graph: `EQ_OVEN_01` đỏ viền trắng (origin), 3 node cam có điểm, đường propagation màu cam. Bảng: `STEP_REFLOW` 1 hop **0.750**, `STEP_AOI` 2 hop **0.562**, `STEP_PACK` 3 hop **0.422** (= 1.0 × 0.75^d). KPI: 3 node bị ảnh hưởng, điểm cao nhất 0.750. |
| 2:00–2:40 | Kéo xuống **Hành động đề xuất**. Tick 1–2 card. | 4 card DEP_MAINT/PROD/QA/SCM với tên bộ phận lấy từ graph, note CONTEXT "Incident origin: EQ_OVEN_01…", bộ đếm "x/4 hoàn thành". |
| 2:40–3:20 | Click node **High-speed Pick & Place** trên graph (hoặc card **Lỗi chất lượng vật liệu**), mức độ **0.8**, **Chạy mô phỏng**. | Origin đổi sang `STEP_SMT`. Điểm: **0.600 / 0.450 / 0.338**. **Nhật ký sự cố & mô phỏng** có 2 dòng. |
| 3:20–3:50 | Chọn origin `BATCH_2026_001` trong dropdown, **Chạy mô phỏng**. | Empty state: **KHÔNG LAN TRUYỀN**, "Không có node downstream bị ảnh hưởng" (batch chỉ có `PROCESSED_BY`, không thuộc quan hệ propagation). Graph bỏ highlight. |
| 3:50–4:30 | (Tuỳ chọn) `docker stop incident_neo4j`, đợi ≤ 15 giây hoặc reload trang. | Banner đỏ "Neo4j chưa sẵn sàng", sidebar **Neo4j không sẵn sàng**, panel topology báo lỗi + nút **Thử lại**. Trang không trắng. `docker start incident_neo4j` → bấm **Thử lại** → graph quay lại. |
| 4:30–5:00 | Tổng kết. | React → FastAPI → Neo4j; impact = severity × decay^distance, tối đa `MAX_HOPS`; playbook theo incident type. |

### Lưu ý khi demo

- Highlight trên graph và bảng impact luôn là của **lần chạy gần nhất**; nếu lần chạy lỗi, kết quả cũ được ẩn để không hiển thị dữ liệu cũ như dữ liệu hiện tại.
- Nội dung action theo incident type là playbook tĩnh của backend (ví dụ MACHINE_BREAKDOWN luôn nhắc `EQ_OVEN_01`), chỉ dòng CONTEXT thay đổi theo origin.
