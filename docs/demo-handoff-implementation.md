# Demo handoff implementation — 11/10/2026

> Ghi chú 12/10/2026: phần workflow demo trong tài liệu này (`X-Demo-Role`, `/resolve`, `/demo/learning`) đã được thay bằng contract trong [api.md](api.md) mục "Contract demo". Phần Gemini/fallback, realtime và timeout vẫn đúng.

Handoff đã được chuyển sang stack thực tế của repository: React/TypeScript + FastAPI + Neo4j (`77ac0e1` khi bắt đầu). Baseline Node.js `95a0a58`, các file `src/app/*.js`, `public/*.js` và kết quả 104 tests trong tài liệu không thuộc repository này.

## Chạy local

```bash
npm run setup
docker compose up -d neo4j
PYTHONPATH=backend .venv/bin/python scripts/seed.py
npm test
npm run preflight
npm run demo
npm run dev
```

UI: http://localhost:5173; backend: http://localhost:8000. `npm run demo` là HTTP rehearsal trên server tạm port 8099 và SQLite tạm; không thay đổi store demo chính. Seed là script hiện có, idempotent; không xoá topology.

`.env` cũ đã được loại khỏi Git index, giữ trên máy. `.env.example` là cấu hình mẫu. Chỉ thêm key trong `.env` local hoặc environment:

```text
INAV_AI_MODE=gemini
INAV_DATA_POLICY=external_approved_synthetic
INAV_LLM_MODEL=gemini-3.5-flash
INAV_GEMINI_API_KEY=<cung cấp local>
```

Cũng chấp nhận `GEMINI_API_KEY` hoặc `GOOGLE_API_KEY`. Backend chạy ngoài Docker cần `NEO4J_URI=bolt://localhost:7687`; Docker Compose override thành `bolt://neo4j:7687`. Để bắt buộc acceptance Gemini thật, chạy `INAV_REQUIRE_LIVE=1 npm run demo`. Lệnh sẽ thất bại nếu guidance fallback, kể cả khi rehearsal deterministic thành công.

Không có key trong môi trường lúc triển khai, nên chưa xác nhận được cuộc gọi Gemini thật. Test provider HTTP và UI narrative dùng response giả lập và được ghi rõ như vậy; không thay thế live acceptance.

## Luồng demo 8–10 phút

1. Operator/Admin chọn node `EQ_OVEN_01`, bấm **Gây lỗi ngay (synthetic)**. Alert đỏ xuất hiện.
2. Operator bấm **Dispatch technician**.
3. Chọn vai trò **Technician**, bấm **Mở work order**. Hướng dẫn tự gọi endpoint explain, không có nút test LLM.
4. Khi cấu hình/key/policy hợp lệ, Gemini thật là primary path. UI gắn nhãn **Diễn đạt bởi Gemini**; các bước deterministic luôn hiện bên dưới. Nếu provider/policy lỗi, UI hiện fallback và lý do tiếng Việt.
5. **Bắt đầu xử lý**, ghi báo cáo, **Resolve incident**. Containment luôn là proposal cần human review.
6. Chọn **Expert**, xem toàn graph, chọn node, kiểm tra chi tiết/quan hệ; chọn sự cố đã resolve và ghi field learning. Tab lịch sử hiển thị annotation được lưu bền vững.
7. Mô phỏng offline để thấy **Mất kết nối**, stale warning sau 10 giây, sau đó online để SSE tự kết nối lại.

Vai trò là chế độ trình diễn local qua `X-Demo-Role`, không phải đăng nhập hay authorization production. Không mở server demo ra mạng public.

## Mapping và boundary

| Hạng mục | Triển khai |
|---|---|
| BE-01 health | Giữ `status`/`database`; thêm capabilities và dependencies; ping không gọi Gemini |
| BE-02/03 Gemini + fallback | `guidance_service.py`: REST generateContent, model cố định, timeout tổng, taxonomy failure, audit model/latency/mode |
| BE-04/05 safety/evidence | Allowlist exact HTTPS host, không redirect/proxy env, synthetic-only, playbook được lọc ID; schema/citation validation; evidence nhãn thân thiện |
| FE-01 realtime | EventSource `plant_tick`, last event, Live/retry/disconnected/stale; offline đóng SSE, online mở lại |
| FE-02 request faults | CRUD 15 giây; explain 65 giây; `finally` mở lại nút; Idempotency-Key tồn tại sau lỗi và reload |
| FE-03/05 wording | Narrative Gemini/fallback riêng; deterministic steps và containment proposal giữ nguyên |
| FE-04 graph | Force relaxation có damping và tether theo các tầng ngữ nghĩa, không randomize/animate; giữ toàn bộ nodes/parallel edges; màu/shape, selection edges, fit/zoom, inspector/history |

`VITE_REQUEST_TIMEOUT_MS`, `VITE_EXPLAIN_TIMEOUT_MS`, `VITE_STALE_MS` cho phép điều chỉnh timeout frontend. `INAV_LLM_TIMEOUT` mặc định 30 giây, tối đa 60 giây.

Store `.data/demo.sqlite3` lưu incident, history, command replay, audit và expert annotation. Incident transition và idempotency response commit trong cùng transaction. Không persist narrative vào knowledge. Annotation liên kết node/sự cố, không tự sửa topology hay rule; Gemini không nhận báo cáo/annotation. `PropagationService` và `DEFAULT_ACTION_RULES` giữ nguyên.

Containment sử dụng đề xuất trong playbook hiện có; repo này chưa có engine conservative/narrow như baseline của tài liệu. Không tạo một engine mới trong task này. `plant_tick` là heartbeat synthetic của dịch vụ demo, không phải telemetry máy thật; không giả lập thông số máy rồi gọi là live metrics.

## Kiểm chứng

```bash
npm test
npm run preflight
npm run demo
PLAYWRIGHT_BROWSERS_PATH=/tmp/inav-browsers npx playwright install chromium
PLAYWRIGHT_BROWSERS_PATH=/tmp/inav-browsers node --disable-warning=ExperimentalWarning scripts/ui_smoke.mjs --shots /tmp/inav-ui-shots
```

UI smoke cần `npm run dev` đang chạy. Đường dẫn ảnh `/tmp` phù hợp Linux; `/private/tmp` trong handoff là đường dẫn macOS. UI smoke đi qua backend/Neo4j thật cho fault → resolve → learning; chỉ riêng kiểm tra render narrative dùng response mock có nhãn rõ. Smoke còn kiểm tra offline/stale/reconnect, request timeout và giữ key khi retry.

Gemini REST contract tham khảo tài liệu chính thức: [generateContent](https://ai.google.dev/api/generate-content), [API key header](https://ai.google.dev/api). Key chỉ nằm trong `x-goog-api-key`, không có trong URL/client/audit. Prompt/schema/citations và kiểm tra các claim bị cấm giới hạn vai trò narration; deterministic guidance/containment là authority hiển thị riêng.

Kết quả chạy tại workspace ngày 11/10/2026:

- `npm run setup`: pass.
- `npm test`: **58 passed**.
- `npm run preflight` và frontend build: pass; topology **19 nodes / 31 edges**.
- `npm run demo`: HTTP workflow pass với `mode=knowledge`, `failure_category=not_configured`.
- UI smoke: **19 checks passed**, không có JavaScript page error; ảnh tại `/tmp/inav-ui-shots`.
- Không tìm thấy signature API key Gemini trong file repository; `.env` local tồn tại và không còn tracked. Propagation service/playbook không thay đổi.

Build còn cảnh báo kích thước bundle; dependencies frontend cũ có npm audit findings. Không nâng major dependencies trong phạm vi handoff này. Live Gemini acceptance vẫn pending do chưa có key local.
