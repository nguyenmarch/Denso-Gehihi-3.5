# Kế hoạch phát triển

## Giai đoạn 1 — Làm ổn định bản hiện tại

**Backend**

- Hoàn thiện migration/seed và xử lý Neo4j unavailable.
- Bổ sung test API cho topology, node detail, simulate, root-cause.
- Chuẩn hóa response lỗi và cấu hình API.

**Frontend**

- Lấy topology thật từ API thay vì dữ liệu tĩnh.
- Hiển thị loading, empty state và lỗi rõ ràng.
- Đồng bộ các KPI với dữ liệu thật; bỏ số liệu demo hard-code.
- Cho phép chọn node từ graph để mở mô phỏng.

**QA/Integration**

- Kiểm tra Docker clean start.
- Kiểm tra seed idempotent.
- Chạy test backend và frontend build.
- Viết kịch bản demo ngắn: topology → simulate → impact → playbook.

## Giai đoạn 2 — Mở rộng incident workflow

- Lưu incident và lịch sử thay đổi.
- Thêm evidence/source reference.
- Thêm trạng thái `created`, `reviewing`, `contained`, `resolved`.
- Thêm export incident report.

## Giai đoạn 3 — Mở rộng có kiểm soát

- Bổ sung role và authentication nếu có yêu cầu thật.
- Bổ sung worker SCADA/MES chỉ sau khi có contract dữ liệu.
- Đánh giá knowledge graph governance và audit trail.

Không triển khai trong MVP: PLC write, tự động release sản phẩm, tích hợp factory thật, LLM quyết định thay người.

## Chia việc 3 người

1. **Backend:** API, Neo4j, services, tests.
2. **Frontend:** React workspace, graph, simulation, error states.
3. **QA/Integration:** Docker, seed, test end-to-end, demo, tài liệu.
