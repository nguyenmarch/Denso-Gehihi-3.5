# Tài liệu Chain Incident Graph

## Mục tiêu

Chain Incident Graph là prototype phân tích sự cố trong dây chuyền sản xuất điện tử. Hệ thống nhận một sự cố tại node, tính phạm vi ảnh hưởng theo đồ thị và trả về playbook hành động cho các bộ phận liên quan.

## Kiến trúc đã chốt

```text
React + TypeScript
        │ REST/JSON
FastAPI
        │ Bolt
Neo4j
```

- Backend: Python, FastAPI, Pydantic, Neo4j driver.
- Frontend: React, TypeScript, Vite, Axios, Cytoscape.js.
- Dữ liệu: node/edge của dây chuyền, incident và playbook.
- Chưa có: realtime simulator, đăng nhập, phân quyền, LLM, workflow Quality/Maintenance đầy đủ.

## Đọc nhanh

1. [Chạy dự án](runbook.md)
2. [Kiến trúc](architecture.md)
3. [API](api.md)
4. [Kế hoạch phát triển](plan.md)
5. [Giới hạn hiện tại](limitations.md)
6. [Phân công team và handoff](team-handoff.md)

Các tài liệu cũ được giữ tại `docs/archive/legacy/` để tham khảo, nhưng không còn là nguồn yêu cầu chính.
