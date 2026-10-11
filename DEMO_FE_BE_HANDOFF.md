# Incident Navigator — Handoff FE/BE hoàn thiện demo

**Ngày:** 2026-10-09  
**Phạm vi:** Chỉ hoàn thiện demo local trên `main`  
**Không phải:** production hardening, factory integration hoặc mở rộng product scope

## 1. Mục tiêu bàn giao

Hoàn thiện bản demo Incident Navigator để trình diễn được một luồng hoàn chỉnh:

```text
Fault synthetic
→ operator thấy alert
→ dispatch technician
→ technician nhận deterministic guidance
→ Gemini thật diễn đạt lại guidance
→ hiển thị containment proposal
→ technician báo cáo
→ expert xem/cập nhật knowledge graph
```

Demo phải chứng minh được:

1. Gemini thật được gọi khi cấu hình hợp lệ.
2. Gemini chỉ diễn đạt lại hướng dẫn đã có, không quyết định root cause hoặc containment.
3. Khi provider không khả dụng, hệ thống fallback về deterministic guidance.
4. Người dùng luôn biết dữ liệu đang live, stale hoặc đã fallback.
5. Knowledge Graph nhìn đủ rõ và chuyên nghiệp để trình diễn, nhưng không được xoá hoặc giản lược dữ liệu chỉ để đẹp.

## 2. Baseline hiện tại

Revision đang dùng:

```text
main @ 95a0a58
```

Evidence đã có:

| Kiểm tra | Kết quả |
|---|---:|
| Backend tests | 104/104 pass |
| Preflight | 10/10 pass |
| HTTP demo rehearsal | 26/26 pass |
| Locked evaluation | 24/24, false-narrow 0, unsafe 0 |
| UI smoke | 23/23 pass, không có console error |
| Gemini live call | `200`, `mode=llm`, narrative có |

Gemini live call đã được kiểm tra trên database tạm, không làm thay đổi database demo chính:

```text
model: gemini-3.5-flash
mode: llm
narrative_returned: true
latency: khoảng 7 giây
```

`gemini-3.8-flash` đã từng trả `503 UNAVAILABLE` do provider quá tải; local demo hiện khóa model ở `gemini-3.5-flash`.

## 3. Phạm vi và nguyên tắc bắt buộc

### Được phép

- Chỉnh UI/UX để demo rõ hơn.
- Chỉnh health/capability response để không gây hiểu nhầm.
- Cho phép Gemini nhận dữ liệu **synthetic, role-filtered** qua policy `external_approved_synthetic`.
- Thêm timeout, trạng thái kết nối, fallback message và visual refinement.
- Thêm test cho các thay đổi trên.

### Không được làm

- Không thêm nút “Test LLM”. Gemini phải được gọi trong luồng guidance thật.
- Không commit API key hoặc `.env`.
- Không xoá toàn bộ egress guard, host allowlist, output validation hoặc audit.
- Không gửi dữ liệu real/unknown ra Gemini.
- Không cho Gemini quyết định scope, root cause, approval hoặc thay đổi knowledge.
- Không thêm PLC, QMS, MES, CMMS, robot, fleet hoặc production write path.
- Không thay đổi deterministic containment engine trong task demo này.
- Không biến fallback thành luồng chính khi Gemini trả output hợp lệ.

## 4. Cấu hình local-only

File `.env` hiện chỉ tồn tại local và đã được `.gitignore` loại khỏi Git:

```env
INAV_PORT=8081
INAV_AI_MODE=gemini
INAV_DATA_POLICY=external_approved_synthetic
INAV_LLM_MODEL=gemini-3.5-flash
```

API key phải được cung cấp qua environment hoặc `.env` local, không ghi vào repository.

Mỗi developer cần tự tạo cấu hình local tương đương. Nếu không có key, hệ thống được phép fallback deterministic để phát triển, nhưng đó không phải trạng thái demo chính thức.

## 5. Handoff cho Backend

### BE-01 — Làm rõ health API

File liên quan:

- `src/app/service.js`
- `src/config.js`
- `tests/*` liên quan health/capability

Hiện tại health trả `scenario_replay` bằng capability `ingestion`. Đây là tên gây hiểu nhầm vì live app đang chạy synthetic ingestion, không phải scenario replay.

Health cần phân biệt rõ:

```json
{
  "capabilities": {
    "synthetic_ingestion": "enabled",
    "optional_ai": "enabled",
    "external_factory_integration": "disabled",
    "control_write": "disabled"
  },
  "dependencies": {
    "ai": {
      "mode": "gemini",
      "configured": true,
      "policy": "external_approved_synthetic"
    },
    "plant_simulation": "running"
  }
}
```

Yêu cầu:

- Không gọi Gemini trong mỗi request health.
- Không gọi `ai=gemini` là bằng chứng provider đang reachable.
- Không hiển thị API key.
- Không phá các field mà frontend hiện đang dùng nếu chưa thống nhất contract mới.
- Cập nhật test response contract.

### BE-02 — Gemini thật là primary path

File liên quan:

- `src/app/llm.js`
- `src/app/guidance.js`
- `src/config.js`
- `tests/guidance.test.js`
- `tests/assistant.test.js`

Trong luồng:

```text
POST /api/v1/incidents/{id}/guidance/explain
```

khi:

- `INAV_AI_MODE=gemini`;
- `INAV_DATA_POLICY=external_approved_synthetic`;
- API key hợp lệ;
- origin là synthetic;
- endpoint được allowlist;

thì phải gọi Gemini thật và trả:

```json
{
  "mode": "llm",
  "narrative": { "summary": "...", "steps": {} },
  "model": "gemini-3.5-flash"
}
```

Không dùng local stub trong demo chính.

### BE-03 — Fallback đúng điều kiện

Fallback deterministic được phép khi:

- network error;
- timeout;
- provider trả HTTP error;
- provider refusal hoặc empty response;
- model output malformed;
- citation/step không thuộc context;
- policy hoặc capability không cho phép outbound.

Khi Gemini trả output hợp lệ, không được âm thầm thay bằng deterministic guidance.

Mọi fallback phải:

- giữ nguyên incident state;
- không ghi narrative invalid vào knowledge graph;
- ghi audit event;
- trả lý do ổn định cho frontend;
- không làm mất deterministic guidance.

### BE-04 — Giữ nguyên safety boundary

Không được bỏ các kiểm tra:

- provider host phải là Gemini allowlist;
- chỉ gửi origin `synthetic`;
- context phải role-filtered;
- Gemini không nhận graph identifiers không cần thiết cho technician;
- output phải được validate trước khi hiển thị;
- API key chỉ nằm trong header, không nằm trong URL/log/audit.

### BE-05 — Narrative phải giữ evidence trace

Hiện backend validate citation của Gemini nhưng narrative trả ra chưa expose citation/evidence thân thiện.

Nếu thay đổi contract, ưu tiên trả thêm dạng không lộ graph ID cho technician:

```json
{
  "evidence": [
    { "label": "Tải trục chính vượt ngưỡng", "source": "machine_event" }
  ]
}
```

Không bắt buộc hiển thị raw knowledge graph ID trên màn hình kỹ thuật viên.

### BE acceptance criteria

- [ ] Payload synthetic gọi được Gemini thật.
- [ ] Response thành công có `mode=llm` và narrative.
- [ ] Provider error trả fallback deterministic.
- [ ] Output invalid không được persist như narrative hợp lệ.
- [ ] Audit ghi được model, latency, mode và failure category nếu có.
- [ ] Health không còn gọi nhầm synthetic ingestion là scenario replay.
- [ ] Không có API key trong Git, response hoặc logs.
- [ ] `npm test` pass.

## 6. Handoff cho Frontend

### FE-01 — Hiển thị trạng thái live rõ ràng

File liên quan:

- `public/ui.js`
- `public/app.js`
- `public/styles.css`

Hiện UI chỉ đổi màu `live-dot` khi SSE mất kết nối. Cần bổ sung:

- `Live` khi đang nhận event;
- `Mất kết nối` khi SSE bị ngắt;
- `Đang kết nối lại` trong retry;
- thời điểm event cuối cùng;
- cảnh báo stale nếu quá ngưỡng không nhận `plant_tick`.

Không được để đồng hồ và số liệu cũ trông như đang live khi SSE đã mất.

### FE-02 — Timeout và lỗi request

File chính:

- `public/ui.js`

Hàm `api()` cần có timeout dùng chung.

Yêu cầu:

- request không chờ vô hạn;
- nút submit/spinner được mở lại khi timeout;
- thông báo tiếng Việt dễ hiểu;
- giữ nguyên Idempotency-Key khi retry command;
- không tạo duplicate dispatch/start/resolve;
- LLM có thể dùng timeout dài hơn request thông thường.

### FE-03 — Hiển thị Gemini và fallback

File liên quan:

- `public/work.js`
- `public/ui.js`

Khi backend trả `mode=llm`:

- hiển thị narrative;
- gắn nhãn rõ “Diễn đạt bởi Gemini”;
- giữ nguyên các bước deterministic;
- không cho narrative thay đổi containment hoặc state.

Khi backend trả fallback:

- hiển thị “Đang dùng hướng dẫn xác định từ knowledge base”;
- nếu phù hợp, hiển thị lý do ngắn như provider timeout/unavailable;
- không hiển thị stack trace hoặc raw provider error.

Không thêm nút test LLM. Request phải phát sinh từ việc mở work order/guidance thật.

### FE-04 — Cải thiện Knowledge Graph visual

File liên quan:

- `public/expert.js`
- `public/styles.css`
- renderer graph hiện tại

Không được giảm số node/edge chỉ để graph nhẹ hơn. Cần cải thiện chất lượng trình bày:

- layout ổn định, ít chồng node;
- hierarchy rõ giữa machine, process, fault, step, part, document;
- màu và shape nhất quán theo node type;
- edge mặc định nhẹ hơn, edge liên quan được highlight;
- node đang chọn nổi bật;
- path tri thức được dùng cho guidance dễ nhận ra;
- label có ưu tiên, không làm toàn canvas rối;
- legend dễ đọc;
- zoom/fit không phá bố cục;
- giữ panel detail và history như hiện tại.

Full graph vẫn phải tồn tại; focused path chỉ là chế độ trình diễn/đọc hiểu.

### FE-05 — Không biến AI thành quyết định

UI phải giữ wording:

```text
Gemini diễn đạt lại hướng dẫn.
Containment là đề xuất.
Quyết định cuối cùng thuộc người phụ trách.
```

Đặc biệt tránh hiển thị câu LLM như mệnh lệnh tuyệt đối kiểu “đã xác nhận nguyên nhân” hoặc “chắc chắn phải cách ly”.

### FE acceptance criteria

- [ ] SSE connected/disconnected/stale state nhìn thấy được.
- [ ] Request treo không làm nút bị disable vô thời hạn.
- [ ] Luồng thành công hiển thị narrative Gemini thật.
- [ ] Luồng fallback hiển thị deterministic guidance rõ ràng.
- [ ] Không có API key/token trên UI.
- [ ] Knowledge Graph đẹp hơn nhưng vẫn giữ đủ topology.
- [ ] UI không blank page khi backend lỗi.
- [ ] `npm run build` hoặc validation tương đương pass.
- [ ] UI smoke pass.

## 7. Luồng demo bắt buộc sau khi ghép FE/BE

### Luồng chính

```text
1. Start main với local .env.
2. Login operator.
3. Admin dùng “Gây lỗi ngay” nếu cần.
4. Operator thấy alert đỏ.
5. Dispatch technician.
6. Technician mở work order.
7. Guidance gọi Gemini thật.
8. Màn hình hiển thị narrative có nhãn Gemini.
9. Containment vẫn là proposal conservative/narrow từ deterministic engine.
10. Technician resolve incident.
11. Expert xem knowledge graph và field learning.
```

### Luồng fallback

Chỉ dùng khi provider thực sự lỗi:

```text
Gemini timeout/provider error
→ mode=knowledge
→ deterministic guidance vẫn đầy đủ
→ UI hiển thị fallback reason
→ không có narrative bịa
```

### Những điều presenter phải nói rõ

- Dữ liệu là synthetic.
- Gemini chỉ diễn đạt lại, không ra quyết định.
- Containment cần human review.
- Không có đường điều khiển tới máy/PLC/QMS.
- `.env` và API key chỉ tồn tại local.

## 8. Validation commands

Chạy trong môi trường local có API key:

```bash
npm run setup
npm test
npm run preflight
npm run demo
node --disable-warning=ExperimentalWarning scripts/ui_smoke.mjs --shots /private/tmp/denso-ui-shots
```

Manual acceptance bắt buộc:

```text
POST /api/v1/incidents/{id}/guidance/explain
→ mode=llm
→ narrative có
→ model=gemini-3.5-flash
```

Không ghi API key vào report, screenshot hoặc commit.

## 9. Definition of Done cho demo

### Backend

- [ ] Health contract không gây hiểu nhầm.
- [ ] Gemini thật là primary path khi local demo được cấu hình.
- [ ] Fallback deterministic đã được kiểm tra.
- [ ] Safety/audit/validation không bị hạ cấp.

### Frontend

- [ ] Live state và stale state nhìn thấy được.
- [ ] Request timeout và error state hoạt động.
- [ ] Gemini narrative/fallback hiển thị đúng.
- [ ] Knowledge Graph đủ đẹp và dễ giải thích.

### End-to-end

- [ ] Chạy được fault → dispatch → guidance → Gemini → resolve → learning.
- [ ] Demo hoàn thành trong 8–10 phút.
- [ ] Không cần nút test riêng.
- [ ] Không có secret trong repository.
- [ ] Không commit `.env`.

## 10. Ngoài phạm vi handoff

- Tích hợp dữ liệu thật DMVN.
- PLC/MES/QMS/CMMS/WMS integration.
- Production deployment hoặc multi-user scaling.
- Rebuild deterministic containment engine.
- Đổi challenge hoặc mở rộng sang SC02 độc lập.
- Xây platform AI tổng quát.
- Thêm authentication/authorization mới.
- Thêm nút test LLM.
