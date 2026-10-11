# Giới hạn hiện tại

- Đây là prototype, chưa phải hệ thống production.
- Dữ liệu và topology phụ thuộc seed Neo4j.
- Incident workflow, command replay, audit và expert annotation được lưu SQLite local; chưa hỗ trợ multi-user scaling.
- Topology/impact lấy từ API; SSE plant_tick chỉ là heartbeat synthetic, không phải telemetry máy.
- Worker SCADA/MES mới là integration hook, chưa kết nối hệ thống thật.
- Vai trò demo không phải authentication/authorization production. Guidance audit chỉ ghi metadata an toàn.
- Gemini thật cần API key local; khi triển khai chưa có key để xác nhận live acceptance.
- Containment proposal dùng playbook tĩnh hiện có; chưa có engine conservative/narrow của baseline Node.js trong tài liệu handoff.
- Kết quả mô phỏng không được dùng để tuyên bố cải thiện thực tế tại nhà máy.
- Không có đường ghi xuống PLC, máy móc hoặc hệ thống điều khiển.
