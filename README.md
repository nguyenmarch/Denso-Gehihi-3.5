# Chain Incident Graph

Prototype phân tích sự cố và lan truyền ảnh hưởng trong dây chuyền sản xuất.

```text
React + TypeScript → FastAPI → Neo4j
```

## Chức năng hiện tại

- Hiển thị topology của dây chuyền.
- Mô phỏng `MACHINE_BREAKDOWN`, `MATERIAL_DEFECT`, `CYCLE_TIME_SPIKE`.
- Tính node bị ảnh hưởng theo công thức suy giảm theo khoảng cách.
- Hiển thị playbook hành động cho Maintenance, Production, QA/QC và SCM.
- Truy vết root cause theo graph.
- Demo local fault synthetic → dispatch → guidance Gemini/fallback → resolve → expert field learning.
- Trạng thái SSE live/stale và lưu workflow/audit local.

## Chạy nhanh

```bash
docker compose up --build
curl http://localhost:8000/health
```

Frontend local:

```bash
cd frontend && npm install && npm run dev
```

Demo handoff hoàn chỉnh: [hướng dẫn và kiểm chứng](docs/demo-handoff-implementation.md). Chạy `npm run setup`, seed Neo4j rồi `npm run dev` từ thư mục gốc.

Chi tiết xem [docs/runbook.md](docs/runbook.md).

## Tài liệu

- [Kiến trúc](docs/architecture.md)
- [API](docs/api.md)
- [Kế hoạch phát triển](docs/plan.md)
- [Giới hạn](docs/limitations.md)

Tài liệu cũ được lưu tại `docs/archive/legacy/`, không dùng làm yêu cầu hiện tại.
