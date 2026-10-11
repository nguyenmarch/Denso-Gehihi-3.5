# Giới hạn hiện tại

- Đây là prototype, chưa phải hệ thống production.
- Dữ liệu và topology phụ thuộc seed Neo4j; thời gian, record xử lý và kiểm tra profile là dữ liệu giả lập của một ca duy nhất (`EQ_OVEN_01`).
- Incident, report, history, bài học, command replay và audit được lưu SQLite local; chưa hỗ trợ multi-user scaling. Hồ sơ theo contract trước 12/10/2026 vẫn nằm trong store nhưng không được hiển thị.
- Topology/impact lấy từ API; SSE plant_tick chỉ là heartbeat synthetic, không phải telemetry máy.
- Worker SCADA/MES mới là integration hook, chưa kết nối hệ thống thật.
- Actor demo không phải authentication/authorization production. Guidance audit chỉ ghi metadata an toàn.
- Quy tắc tác động `suspect_window_v1`:
  - chỉ xét sự cố thiết bị; sự cố công đoạn/lô trả `not_applicable`;
  - cửa sổ nghi ngờ luôn còn mở vì chưa ghi nhận thời điểm cô lập thiết bị;
  - chưa có thao tác giữ/giải phóng lô; lô affected/unknown chỉ được đánh dấu cần xác minh.
- Hướng dẫn chỉ có cho 3 cặp (tài sản, loại sự cố); ngữ cảnh khác trả knowledge gap. Chưa có dữ liệu vật tư thay thế và vị trí kho.
- Bài học được duyệt một lần (accept/reject) và dùng lại theo đúng cặp (tài sản, loại sự cố); chưa có version control tri thức hay graph editor.
- Gemini thật chỉ có ở môi trường có key (đã chạy live trong container backend ngày 12/10/2026). Model `gemini-3.5-flash` đôi khi trả 503; backend thử lại tối đa 3 lần rồi fallback.
- Câu hỏi của kỹ thuật viên được gửi tới Gemini; chỉ nhập dữ liệu synthetic.
- Containment proposal dùng playbook tĩnh hiện có; chưa có engine conservative/narrow của baseline Node.js trong tài liệu handoff.
- Kết quả mô phỏng không được dùng để tuyên bố cải thiện thực tế tại nhà máy.
- Không có đường ghi xuống PLC, máy móc hoặc hệ thống điều khiển.
