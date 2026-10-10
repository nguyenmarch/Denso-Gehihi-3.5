# Phân công FE / BE — Factory Incident Intelligence Demo

## 1. Phạm vi và người phụ trách

| Mục | Nội dung |
|---|---|
| Nhánh xuất phát | feature/frontend-integration; revision được review: 77ac0e1. |
| Kiến trúc | React / TypeScript → FastAPI → Neo4j. |
| Bài toán | Xử lý sự cố máy/công đoạn, liên kết tác động tới sản phẩm với công việc bảo trì. |
| Data | Nhà máy giả lập; ID, thời gian, quan hệ và kết quả kiểm tra nhất quán. |
| Đầu ra | Sự cố → tác động → giao việc → xử lý → báo cáo → xem lại; có LLM thật và một bài học được xác nhận, tái sử dụng. |
| Tình trạng | Kế hoạch giao việc. Chưa có nhiệm vụ nào được nghiệm thu bằng tài liệu này. |

Handoff này thay scope sprint trong [team-handoff.md](team-handoff.md) cho giai đoạn hoàn thiện demo. Giữ conventions của repo; main chỉ là nguồn tham khảo tùy chọn. FE chọn bố cục và tương tác; BE chọn domain model, module và API. Thay đổi ảnh hưởng cả hai bên được ghi vào contract trước khi nối. Dependency production mới hoặc thay đổi kiến trúc lớn cần được thống nhất trước khi triển khai.

| Vai trò thực hiện | Trách nhiệm | Người nhận |
|---|---|---|
| FE | UI, API client, tương tác và kiểm tra trình duyệt. | TBD |
| BE | Data, logic, persistence, API, LLM và test backend. | TBD |
| Người phụ trách demo | Chốt phạm vi, ưu tiên và nghiệm thu cuối; có thể là một thành viên FE/BE. | TBD |

Người phụ trách demo điền người nhận, reviewer và lịch bàn giao khi phân công. Deadline mới chưa được cung cấp; không dùng deadline sprint cũ để suy ra lịch mới. Commit, push và merge theo chỉ thị của người phụ trách repo.

## 2. Hiện trạng và nhiệm vụ xử lý

| Hiện trạng ở revision review | Nơi liên quan | Nhiệm vụ |
|---|---|---|
| Topology lấy từ Neo4j; simulation chỉ tính node downstream và score theo hop. | backend/app/services/propagation_service.py; frontend/src/components/GraphCanvas.tsx | BE-04 / FE-03 |
| Máy đóng gói nhận hướng dẫn sửa lò vì playbook chỉ chọn theo loại sự cố. | backend/app/models/playbooks.py; backend/app/services/recommendation_service.py | BE-05 |
| Batch nối vào công đoạn nhưng chưa được xác định trong phạm vi ảnh hưởng. | backend/data/seed_scenarios.cypher | BE-01 / BE-04 |
| Origin kiểm tra tồn tại, chưa kiểm tra loại node phù hợp với sự cố. | backend/app/api/v1/incidents.py | BE-02 / BE-04 |
| History và checkbox chỉ lưu trong React state; chưa có incident workflow bền vững. | frontend/src/App.tsx; frontend/src/components/ActionMatrix.tsx | BE-02 / BE-03 / FE-04 / FE-05 |
| Root-cause API trả upstream candidates, chưa xác nhận nguyên nhân. | backend/app/services/root_cause_service.py | BE-04 / FE-03 |
| Chưa có LLM, report và cơ chế xem xét bài học. | Backend / frontend | BE-06 / BE-07 / FE-06 / FE-07 |
| CORS mặc định thiếu 127.0.0.1:5173; cổng 8000 local có thể thuộc project khác. | backend/app/core/config.py; frontend/src/services/api.ts | BE-08 / FE-08 |

Các phát hiện này mô tả prototype, không phải hiện trạng DMVN. Worker SCADA/MES là placeholder; ca demo có thể được kích hoạt qua API scenario.

## 3. Kết quả người dùng cần thực hiện được

| Trách nhiệm nghiệp vụ | Thao tác | Kết quả được lưu |
|---|---|---|
| Điều phối | Mở sự cố, xem tác động, ghi quyết định tiếp theo, giao người xử lý. | Incident, quyết định, người nhận, thời gian. |
| Xử lý | Nhận việc, xem hướng dẫn, hỏi trợ lý, ghi kiểm tra/thao tác và kết quả. | Tiến trình, report, kết quả và việc còn mở. |
| Xác nhận tri thức | Xem nguồn bài học; sửa/chấp nhận/từ chối; kiểm tra khả năng dùng lại. | Nguồn report, kết quả xem xét và người xác nhận. |

Tên persona và cách chuyển trách nhiệm chốt tại PRE-01 / PRE-02. Có thể dùng chung workspace. Nếu dùng persona selector, gọi rõ là vai trò demo; nếu triển khai đăng nhập, BE kiểm tra quyền thao tác. Mỗi mutation lưu actor và trách nhiệm tương ứng.

Ca chính phải nối một incident với batch/WIP/sản phẩm cụ thể và hướng xử lý bảo trì. Người dùng xem được lý do, phần chưa biết và việc tiếp theo. Kết quả sửa máy không tự động giải phóng sản phẩm khỏi kiểm tra/giữ hàng.

Simulator liên tục, nhiều chuyền, graph editor đầy đủ, version control tri thức và analytics nâng cao làm sau luồng chính. Factory integration và ghi điều khiển sản xuất ngoài phạm vi.

## 4. Thứ tự triển khai

| Mốc | Đầu ra | Nhiệm vụ | Owner mốc |
|---|---|---|---|
| M0 — Chuẩn bị | Kịch bản, contract và cấu hình chạy được bàn giao. | PRE-01, PRE-02; BE-08 phần setup. | Người phụ trách demo |
| M1 — Ca xử lý đầu tiên | Incident → impact → giao/nhận → report → mở lại hồ sơ. | BE-01…BE-05, FE-01…FE-05, INT-01. | FE |
| M2 — Năng lực demo đầy đủ | LLM thật và bài học được xác nhận, dùng lại. | BE-06, BE-07, FE-06, FE-07. | BE |
| M3 — Nghiệm thu | Ca đối lập, lỗi/phục hồi, test/build và rehearsal. | BE-08, FE-08, INT-02, INT-03. | Người phụ trách demo |

**P0:** mở dependency hoặc chặn M1; làm và ghép trước. **P1:** bắt buộc cho demo cuối, triển khai khi đầu vào sẵn sàng. **P2:** nâng chất lượng bổ sung; không có task P2 trong scope bắt buộc dưới đây.

FE làm layout/client bằng payload đã chốt song song với BE; thay fixture phát triển bằng API thật trước INT-01. Task thiếu đầu vào không chặn các task độc lập khác.

## 5. Chuẩn bị giao việc

### PRE-01 — Kịch bản và hành trình người dùng

- **Owner / reviewer:** FE / BE; người phụ trách demo chốt phạm vi.
- **Ưu tiên / đầu vào:** P0, M0; hiện trạng mục 2, đầu ra mục 3.
- **Phải làm:** đề xuất một ca chính; mô tả event, đối tượng chịu tác động, trách nhiệm và thao tác đến kết quả; phác bố cục; xác định data BE cần cung cấp. Mô tả hai ca đối lập trong mục 9 và chọn một số đo demo có cách quan sát.
- **Bàn giao:** mục “Kịch bản dự kiến” trong docs/demo-script.md; phác hành trình/bố cục; danh sách data và quyết định đã chốt/còn mở. Không ghi kết quả chưa chạy.
- **Nghiệm thu:** BE liệt kê được records và mutations cần hỗ trợ; FE chỉ được thao tác của từng trách nhiệm từ tài liệu; người phụ trách demo xác nhận ca chính.
- **Người nhận / mở khóa:** BE; PRE-02, BE-01, FE-01.
- **Lựa chọn cần chốt:** chuyền/kịch bản và trách nhiệm. Layout chi tiết thuộc FE. Deadline được ghi khi nhận việc.

### PRE-02 — Contract phát triển

- **Owner / reviewer:** BE / FE.
- **Ưu tiên / đầu vào:** P0, M0; PRE-01. Có thể chuẩn bị draft từ hiện trạng trước khi PRE-01 hoàn tất.
- **Phải làm:** contract incident/list/detail, impact, giao/nhận, report/history, guidance/LLM và lesson/review; semantics trạng thái, actor, điều kiện chuyển, retry và errors. Chọn phương án lưu bền vững theo kiến trúc hiện có.
- **Bàn giao:** docs/api.md phân biệt API hiện có và dự kiến; payload JSON success/empty/missing/error; bảng chuyển trạng thái và cách nhận diện trách nhiệm. Ghi phương án lưu trữ trong docs/architecture.md.
- **Nghiệm thu:** mỗi thao tác PRE-01 có contract hoặc được ghi ngoài scope; FE dựng được types/client từ payload; actor, ID, status và error không cần FE tự suy đoán.
- **Người nhận / mở khóa:** FE và BE; các task triển khai theo contract.
- **Lựa chọn cần chốt:** endpoint, DTO, trạng thái và nhận diện actor trước khi caller triển khai. Đổi contract sau đó phải đồng bộ caller/test/docs.

## 6. Backend

### BE-01 — Data kịch bản và seed

- **Owner / reviewer:** BE / FE.
- **Ưu tiên / dependency:** P0, M1; PRE-01 và phương án data PRE-02.
- **Phải làm:** seed tài sản/công đoạn, batch/sản phẩm, sự kiện/thời gian, inspection, người xử lý demo và reference hướng dẫn. Chuẩn bị ca chính và hai ca đối lập; ghi ID, hướng relation và expected outcome trước khi chạy engine.
- **Bàn giao:** migration/seed trong backend/data/; fixtures/expected outcome trong docs/demo-script.md; setup/reset trong docs/runbook.md. Expected outcome không lấy bằng cách sao chép output engine cần kiểm tra.
- **Nghiệm thu:** database demo sạch seed được; seed lần hai không duplicate; IDs của script tồn tại; ít nhất một đối tượng trong và một đối tượng ngoài phạm vi ca chính có căn cứ phân biệt. Reset giới hạn vào data demo của repo và ghi phần bị xóa.
- **Người nhận:** BE-02 / BE-04 / BE-05; FE-02 / FE-03; INT-01 / INT-02.

### BE-02 — Tạo và đọc hồ sơ sự cố

- **Owner / reviewer:** BE / FE.
- **Ưu tiên / dependency:** P0, M1; PRE-02, BE-01.
- **Phải làm:** nhận event scenario/API, tạo incident có ID/thời gian/tài sản/loại lỗi/context/origin; lưu bền vững; cung cấp list/detail. Validate tài sản và loại sự cố; xử lý gửi lại cùng event theo contract.
- **Bàn giao:** API create/list/detail, persistence, test và incident IDs cho FE.
- **Nghiệm thu:** tạo → list/detail → restart backend → đọc lại cùng hồ sơ; gửi lại cùng event không tạo incident thứ hai; origin không tồn tại hoặc sai loại trả lỗi có nghĩa.
- **Người nhận:** BE-03; FE-02 / FE-04; INT-01.

### BE-03 — Giao việc, tiến trình và report

- **Owner / reviewer:** BE / FE.
- **Ưu tiên / dependency:** P0, M1; PRE-02, BE-02.
- **Phải làm:** lưu quyết định/ghi chú, assignee, nhận xử lý, kiểm tra/thao tác, report và việc còn mở; history có actor/thời gian. Thực thi chuyển trạng thái và trách nhiệm ở API theo contract.
- **Bàn giao:** APIs workflow/report/history, test transitions/retry; chuỗi request mẫu từ giao việc đến kết quả.
- **Nghiệm thu:** A giao cho B → B nhận/ghi kết quả → A đọc lại; restart giữ dữ liệu; thao tác sai trạng thái hoặc trách nhiệm bị xử lý theo contract; retry không tạo history/report trùng; kết quả chưa khắc phục giữ được bước tiếp theo.
- **Người nhận:** FE-04 / FE-05; BE-07; INT-01.

### BE-04 — Tác động nghiệp vụ và căn cứ

- **Owner / reviewer:** BE / FE.
- **Ưu tiên / dependency:** P0, M1; PRE-02, BE-01, BE-02.
- **Phải làm:** liên kết event với batch/WIP/sản phẩm theo relation và thời gian/evidence của kịch bản; trả loại tác động, reasons/references và unknown. Dùng topology propagation làm phần giải thích nếu phù hợp; phân biệt upstream candidates với nguyên nhân đã xác nhận.
- **Bàn giao:** impact service/API, test fixtures, quy tắc trong docs/architecture.md; payload affected/unaffected/unknown.
- **Nghiệm thu:** IDs và reasons khớp expected outcome BE-01; đổi evidence/thời gian ở ca đối lập làm kết quả đổi theo quy tắc; thiếu dữ liệu không bị gọi là không ảnh hưởng. Incident types có thể cùng tập node nhưng phải có semantics/hướng xử lý phù hợp.
- **Người nhận:** FE-03; BE-05 / BE-06; INT-01 / INT-02.

### BE-05 — Hướng dẫn đúng context

- **Owner / reviewer:** BE / FE.
- **Ưu tiên / dependency:** P0, M1; PRE-02, BE-01, BE-02; dùng impact BE-04 khi có.
- **Phải làm:** chọn guidance/action theo tài sản/công đoạn/fault; trả kiểm tra, bước xử lý, nguồn/rule; thêm vật tư/vị trí nếu data có. Context không có nội dung phù hợp trả knowledge gap.
- **Bàn giao:** guidance service/API, test matching; ít nhất hai context để kiểm tra không dùng lẫn playbook.
- **Nghiệm thu:** máy đóng gói không nhận bước sửa heater lò; context chưa có hướng dẫn hiện gap; giải thích được reference/rule chọn hướng dẫn; output dùng được trong report và UI người xử lý.
- **Người nhận:** FE-05; BE-06 / BE-07; INT-01.

### BE-06 — LLM thật hỗ trợ xử lý

- **Owner / reviewer:** BE / FE.
- **Ưu tiên / dependency:** P1, M2; PRE-02, BE-02, BE-04, BE-05; credential/config provider hợp lệ.
- **Phải làm:** backend gọi provider để trả lời/diễn giải theo incident, evidence và guidance; kiểm tra schema/reference; timeout; fallback có reason khi call lỗi hoặc output bị từ chối. LLM giữ vai trò đề xuất/giải thích.
- **Bàn giao:** endpoint/client, config example không secret, test controlled success/failure, một kiểm tra provider thật; response mẫu và config/giới hạn trong runbook.
- **Nghiệm thu:** config hợp lệ có outbound request thật và câu trả lời đúng context; lỗi/timeout/output sai vẫn có guidance nền; response/log phân biệt thành công, lỗi gọi và output bị từ chối. LLM không tự thay scope, đóng incident, xác nhận nguyên nhân hoặc tri thức.
- **Người nhận:** FE-06; INT-02 / INT-03. Credential thiếu được ghi blocked; mocked response không đạt tiêu chí provider thật.

### BE-07 — Bài học và tái sử dụng

- **Owner / reviewer:** BE / FE.
- **Ưu tiên / dependency:** P1, M2; PRE-02, BE-03, BE-05.
- **Phải làm:** lưu bài học do người dùng đề xuất từ report, liên kết incident/report/tác giả; API xem/sửa/chấp nhận/từ chối; đưa bài học accepted vào guidance đúng context. Phân biệt pending với accepted.
- **Bàn giao:** APIs lesson/review, persistence, guidance đọc lại và tests. Form/manual proposal đủ cho scope này; tự trích xuất bằng LLM và version control đầy đủ là phần mở rộng.
- **Nghiệm thu:** report → lesson pending → review accepted → incident cùng context đọc được guidance mới có nguồn; rejected không thành hướng dẫn đã xác nhận; restart giữ review. Report vẫn lưu nếu tạo lesson thất bại, với lỗi được ghi nhận.
- **Người nhận:** FE-07; INT-02 / INT-03.

### BE-08 — Môi trường và integration tests

- **Owner / reviewer:** BE / FE.
- **Ưu tiên / dependency:** P0 phần setup tại M0, không cần contract mới; P1 validation cuối tại M3, phụ thuộc BE-01…BE-07.
- **Phải làm:** cấu hình host/container, port, API base, CORS/health; chuẩn hóa API errors; test seed/query với Neo4j thật và persistence/workflow. Runbook startup/recovery không ảnh hưởng project khác.
- **Bàn giao:** docs/runbook.md, env example không secret, commands integration và command/revision/result thực tế.
- **Nghiệm thu:** browser ở origin trong runbook gọi topology/mutation được; DB lỗi không giả success; đổi port đồng bộ FE/BE; integration chạy trên database demo/test đúng scope. Không dừng/xóa database của project khác.
- **Người nhận:** FE-01 phần setup; FE-08, INT-01…INT-03 phần validation.

## 7. Frontend

### FE-01 — Workspace và API client

- **Owner / reviewer:** FE / BE.
- **Ưu tiên / dependency:** P0, M1; PRE-01, PRE-02; cấu hình BE-08.
- **Phải làm:** navigation/workspace theo journey, trách nhiệm hiện tại; types/client và loading/empty/error chung. Tách fixture phát triển khỏi API thật.
- **Bàn giao:** bố cục, client dùng lại, ánh xạ thao tác PRE-01 sang UI; build chạy được.
- **Nghiệm thu:** mở được view phù hợp trách nhiệm; API base từ config; render được success/error payload PRE-02; fixture nếu có được ghi rõ.
- **Người nhận:** FE-02…FE-07; BE review DTO/client.

### FE-02 — Bối cảnh và hồ sơ sự cố

- **Owner / reviewer:** FE / BE.
- **Ưu tiên / dependency:** P0, M1; FE-01, BE-01, BE-02.
- **Phải làm:** chuyền/tài sản, mở hoặc kích hoạt ca demo, incident list/detail với ID/thời gian/context/trạng thái/người phụ trách; số liệu từ API.
- **Bàn giao:** đường từ bối cảnh đến incident; loading/empty/error và mở lại hồ sơ sau refresh.
- **Nghiệm thu:** kích hoạt → mở đúng ID → reload vẫn đúng hồ sơ; component mount lại không tự tạo event mới; list rỗng không hiển thị lịch sử giả.
- **Người nhận:** FE-03 / FE-04 / FE-05; INT-01.

### FE-03 — Tác động và graph

- **Owner / reviewer:** FE / BE.
- **Ưu tiên / dependency:** P0, M1; FE-02, BE-04.
- **Phải làm:** đối tượng tác động, reasons/evidence và unknown; graph highlight từ API; xem context của đối tượng; origin selector phù hợp loại sự cố.
- **Bàn giao:** view tác động gắn incident; graph có labels/legend và focus/selection đủ đọc ca demo.
- **Nghiệm thu:** chọn batch mở được lý do/reference; unaffected và unknown có nhãn khác nhau; request mới lỗi không hiển thị highlight cũ như kết quả mới; đổi node selection không tự đổi kết quả incident đang đọc.
- **Người nhận:** FE-04 / FE-05; INT-01 / INT-02.

### FE-04 — Giao và nhận việc

- **Owner / reviewer:** FE / BE.
- **Ưu tiên / dependency:** P0, M1; FE-02, BE-03.
- **Phải làm:** chọn người nhận/ghi quyết định, gửi giao việc; người nhận xem danh sách và nhận xử lý; trạng thái từ API, ngăn double-submit khi đang chờ.
- **Bàn giao:** giao/nhận dùng API và validation/error từng thao tác.
- **Nghiệm thu:** A giao B → B thấy/nhận việc → reload giữ assignee/state → A đọc thấy thay đổi; API từ chối không làm UI báo success.
- **Người nhận:** FE-05; INT-01.

### FE-05 — Xử lý, report và history

- **Owner / reviewer:** FE / BE.
- **Ưu tiên / dependency:** P0, M1; FE-04, BE-03, BE-05; FE-03 phần impact.
- **Phải làm:** guidance có nguồn; ghi checks/actions/report, kết quả chưa khắc phục và bước tiếp theo; history; chỉ báo lưu/hoàn tất sau API xác nhận.
- **Bàn giao:** workspace người xử lý và report/history đọc lại từ backend.
- **Nghiệm thu:** ghi/check → lưu → refresh còn data; report xuất hiện cho điều phối cùng incident; report invalid hiện field error; kết quả “chưa khắc phục” không hiện như sửa thành công. Đọc được tác động sản phẩm còn cần xác minh sau sửa máy.
- **Người nhận:** FE-06 / FE-07; INT-01.

### FE-06 — Trợ lý theo sự cố

- **Owner / reviewer:** FE / BE.
- **Ưu tiên / dependency:** P1, M2; FE-05, BE-06.
- **Phải làm:** hỏi/diễn giải trong workspace xử lý, gửi đúng context; answer/reference/loading/fallback; guidance nền dùng được khi chờ hoặc lỗi.
- **Bàn giao:** một tương tác LLM qua endpoint thật trong ca chính.
- **Nghiệm thu:** câu hỏi về bước kiểm tra nhận answer/reference đúng incident; provider lỗi có fallback reason; không mất report đang nhập, không tự hoàn tất việc; answer cũ không hiện dưới incident mới; secret không có ở FE.
- **Người nhận:** INT-02 / INT-03.

### FE-07 — Bài học và review

- **Owner / reviewer:** FE / BE.
- **Ưu tiên / dependency:** P1, M2; FE-05, BE-07.
- **Phải làm:** đề xuất lesson từ report; trách nhiệm xác nhận xem nguồn/sửa/chấp nhận/từ chối; hiển thị trạng thái theo API.
- **Bàn giao:** lesson/review dùng API; đường mở nguồn và guidance sau review.
- **Nghiệm thu:** report → lesson → reviewer mở nguồn/accepted → reload giữ review → incident cùng context đọc bài học; pending/rejected không hiển thị như nội dung đã xác nhận.
- **Người nhận:** INT-02 / INT-03.

### FE-08 — UI và failure/recovery

- **Owner / reviewer:** FE / BE.
- **Ưu tiên / dependency:** P1, M3; FE-01…FE-07, BE-08. Loading/error cơ bản làm trong từng task, không chờ FE-08.
- **Phải làm:** tiếng Việt/labels/bố cục nhất quán; kiểm tra graph/text/control trên màn hình trình diễn; backend unavailable, empty, mutation lỗi và retry; bỏ fixture khỏi đường nghiệm thu.
- **Bàn giao:** build đạt; checklist browser có revision/URL, lỗi đã thử và bằng chứng.
- **Nghiệm thu:** lỗi không blank page/success giả; retry không mất hồ sơ; form lỗi giữ nội dung để sửa; graph đọc được tài sản/batch của ca; trình duyệt gọi được API thực tế.
- **Người nhận:** INT-02 / INT-03.

## 8. Ghép và nghiệm thu

Các dependency chính:

~~~text
PRE-01 → PRE-02 → contract FE / BE
                  ├→ BE-01 + BE-02 → FE-02
                  ├→ BE-04         → FE-03
                  ├→ BE-03         → FE-04
                  └→ BE-05         → FE-05
                           ↓
                         INT-01
                  ├→ BE-06 → FE-06
                  └→ BE-07 → FE-07
                           ↓
                 BE-08 + FE-08 → INT-02 → INT-03
~~~

Dependency đầy đủ ghi ở từng task; BE-08 phần setup bắt đầu từ M0. Mỗi API bàn giao có revision/URL, payload, IDs thử, errors, lệnh kiểm tra và phần chưa làm. Payload dự kiến không được báo là endpoint đã triển khai.

### INT-01 — Ca xử lý đầu tiên

- **Owner / reviewer:** FE / BE.
- **Ưu tiên / dependency:** P0, M1; các task M1 và cấu hình BE-08.
- **Bàn giao:** biên bản docs/demo-script.md ghi revision, scenario, thao tác, expected/actual của incident → impact → giao/nhận → report → mở lại.
- **Nghiệm thu:** API thật cho mọi mutation; ID/context đồng bộ; đổi persona/reload không mất việc; restart backend giữ report/history. Thiếu bước thì mốc chưa pass, ghi task owner cần sửa.
- **Người nhận:** BE / FE để ghép M2.

### INT-02 — Ca đối lập và failure/recovery

- **Owner / reviewer:** BE / FE.
- **Ưu tiên / dependency:** P1, M3; các task BE/FE, INT-01.
- **Bàn giao:** kết quả mục 9, tests backend/integration và bằng chứng browser; failures ghi docs/limitations.md với owner/task và ảnh hưởng.
- **Nghiệm thu:** unaffected có căn cứ khác unknown; invalid origin/retry không tạo sai/trùng; API/DB/LLM lỗi có recovery; accepted/rejected lesson đúng hành vi.
- **Người nhận:** người phụ trách demo; INT-03.

### INT-03 — Bàn giao demo

- **Owner / reviewer:** người phụ trách demo / FE và BE.
- **Ưu tiên / dependency:** P1, M3; INT-01, INT-02.
- **Bàn giao:** runbook đúng revision, script chính/backup, commands/results, limitation và một rehearsal; owner chốt thời lượng, đề xuất ca chính 5–7 phút.
- **Nghiệm thu:** thành viên không viết phần tương ứng dùng runbook khởi động/đi hết ca được; LLM thật trong path chính, fallback kiểm tra riêng; không có blocker mục 10.
- **Người nhận:** team trình diễn. Pass/fail ghi revision và người nghiệm thu.

## 9. Bộ ca kiểm tra chung

BE-01 chuẩn bị fixture/expected outcome; FE review khả năng quan sát trước khi chạy. IDs và số lượng sản phẩm do fixture quyết định.

| Ca | Điều kiện | Kết quả cần kiểm tra | Task |
|---|---|---|---|
| Có tác động | Event và batch/sản phẩm liên hệ theo quy tắc, có context bảo trì. | Đúng đối tượng/reason; đi hết giao/nhận/report và mở lại. | BE-02…BE-05; FE-02…FE-05 |
| Có căn cứ không ảnh hưởng trong phạm vi xét | Data liên hệ/thời gian/inspection đủ để loại trừ đối tượng dù có cảnh báo máy. | Giải thích căn cứ và phạm vi kết luận; không giữ hàng chỉ vì alarm; việc sửa máy có thể vẫn cần. | BE-04; FE-03 |
| Thiếu hoặc mâu thuẫn | Thiếu key/time/inspection hoặc records trái nhau. | Unknown/reason/kiểm tra tiếp; cho ghi quyết định bảo thủ/thủ công; không tự xác nhận narrow scope. | BE-04 / BE-03; FE-03…FE-05 |
| Sai context | Tài sản khác, node sai loại, fault chưa có guidance. | Validate/gap; không dùng playbook máy khác. | BE-02 / BE-04 / BE-05; FE-03 / FE-05 |
| Retry / refresh / restart | Gửi lại event/mutation, reload UI và restart backend. | Không duplicate nghiệp vụ; giữ hồ sơ/assignee/report/review. | BE-02 / BE-03 / BE-07; FE-02…FE-07 |
| Tri thức | Pending, accepted và rejected có report nguồn. | Accepted dùng lại đúng context; pending/rejected không thành nội dung đã xác nhận. | BE-07; FE-07 |
| LLM thật và fallback | Config hợp lệ; thử timeout/error/output sai riêng. | Call thật trong path success; guidance/reason trong path lỗi; không tự đổi quyết định. | BE-06; FE-06 |
| Dependency lỗi | Neo4j/backend không sẵn sàng trên môi trường demo riêng. | Lỗi rõ, không data giả success; retry/restart phục hồi. | BE-08; FE-08 |

Score theo hop là heuristic, upstream traversal là ứng viên điều tra. LLM giải thích/đề xuất, người dùng ghi quyết định. Dữ liệu synthetic chứng minh hành vi prototype, không chứng minh accuracy/ROI DMVN.

PRE-01 chọn một số đo nghiệp vụ của ca: thời gian đến quyết định/việc tiếp theo, thời gian chuẩn bị hồ sơ hoặc phạm vi giữ dư. Ghi điểm bắt đầu/kết thúc; tách thời gian máy/người/chờ. Nếu so baseline, dùng cùng input và yêu cầu. Chưa có so sánh hợp lệ thì chỉ báo thời gian/workflow quan sát, không ghi phần trăm cải thiện.

## 10. Tiêu chí bàn giao và blocker

Demo hoàn chỉnh khi INT-01…INT-03 có bằng chứng pass: workflow lưu được, impact có đối tượng/căn cứ, guidance đúng context, LLM thật, bài học xác nhận/tái sử dụng và các ca lỗi đã kiểm tra.

Blocker phải sửa trước nghiệm thu:

- Không đi hết ca chính hoặc refresh mất kết quả đã báo lưu.
- Hướng dẫn sai tài sản, nhầm unknown với unaffected hoặc không giải thích được đối tượng liên quan.
- Persona/assignee/state UI không khớp backend.
- Path chính chỉ mock/fallback nhưng được mô tả là LLM thật.
- Không có bài học xác nhận và dùng lại.
- CORS/API base sai, blank page hoặc mutation thất bại được báo thành công.
- Secret trong bundle/tài liệu/ảnh hoặc reset ảnh hưởng data ngoài dự án.

Phần mở rộng chưa làm ghi limitation: nhiều chuyền, simulator liên tục, version control đầy đủ, factory integration. Limitation không thay thế việc sửa blocker.

Lệnh kiểm tra nền:

~~~bash
PYTHONPATH=backend backend/.venv/bin/pytest -q backend/tests
cd frontend && npm run build
~~~

BE-08 bổ sung setup/integration commands. Mocked unit tests và build không thay thế INT-01…INT-03. Mọi kết quả có command, revision, môi trường và actual result; kiểm tra chưa chạy ghi rõ blocked.

## 11. Theo dõi và bàn giao từng task

Task IDs phiên bản này thay danh sách FE/BE trước; dùng ID kèm tiêu đề khi tạo issue. Các nhiệm vụ ban đầu là **chưa nhận/chưa làm**. Owner cập nhật trạng thái khi có bằng chứng.

| Mã việc | Owner chính | Reviewer | Trạng thái | Hạn / điểm ghép | Output / revision | Blocker |
|---|---|---|---|---|---|---|
| PRE-01 | FE | BE / người phụ trách demo | Chưa nhận | TBD / M0 | Chưa có | — |
| PRE-02 | BE | FE | Chưa nhận | TBD / M0 | Chưa có | PRE-01 |
| BE-01 | BE | FE | Chưa nhận | TBD / M1 | Chưa có | PRE-01 / PRE-02 |
| BE-02 | BE | FE | Chưa nhận | TBD / M1 | Chưa có | PRE-02 / BE-01 |
| BE-03 | BE | FE | Chưa nhận | TBD / M1 | Chưa có | PRE-02 / BE-02 |
| BE-04 | BE | FE | Chưa nhận | TBD / M1 | Chưa có | PRE-02 / BE-01 / BE-02 |
| BE-05 | BE | FE | Chưa nhận | TBD / M1 | Chưa có | PRE-02 / BE-01 / BE-02 |
| BE-06 | BE | FE | Chưa nhận | TBD / M2 | Chưa có | PRE-02 / BE-02 / BE-04 / BE-05 / config provider |
| BE-07 | BE | FE | Chưa nhận | TBD / M2 | Chưa có | PRE-02 / BE-03 / BE-05 |
| BE-08 | BE | FE | Chưa nhận | TBD / M0 + M3 | Chưa có | Setup: —; validation: BE-01…BE-07 |
| FE-01 | FE | BE | Chưa nhận | TBD / M1 | Chưa có | PRE-01 / PRE-02 / setup BE-08 |
| FE-02 | FE | BE | Chưa nhận | TBD / M1 | Chưa có | FE-01 / BE-01 / BE-02 |
| FE-03 | FE | BE | Chưa nhận | TBD / M1 | Chưa có | FE-02 / BE-04 |
| FE-04 | FE | BE | Chưa nhận | TBD / M1 | Chưa có | FE-02 / BE-03 |
| FE-05 | FE | BE | Chưa nhận | TBD / M1 | Chưa có | FE-04 / BE-03 / BE-05 / impact FE-03 |
| FE-06 | FE | BE | Chưa nhận | TBD / M2 | Chưa có | FE-05 / BE-06 |
| FE-07 | FE | BE | Chưa nhận | TBD / M2 | Chưa có | FE-05 / BE-07 |
| FE-08 | FE | BE | Chưa nhận | TBD / M3 | Chưa có | FE-01…FE-07 / BE-08 |
| INT-01 | FE | BE | Chưa nhận | TBD / M1 | Chưa có | Task M1 / setup BE-08 |
| INT-02 | BE | FE | Chưa nhận | TBD / M3 | Chưa có | Task BE/FE / INT-01 |
| INT-03 | Người phụ trách demo | FE / BE | Chưa nhận | TBD / M3 | Chưa có | INT-01 / INT-02 |

Owner trong bảng là vai trò chịu trách nhiệm, tên cá nhân điền ở mục 1. Cột “Blocker” ban đầu liệt kê đầu vào cần bàn giao, không khẳng định có sự cố đang phát sinh; owner cập nhật khi dependency đạt hoặc khi phát hiện trở ngại mới. Thời hạn để TBD đến khi team phân bổ capacity.

Trạng thái: **chưa nhận → đang làm → chờ review → đạt**. **Blocked** kèm đầu vào thiếu/người giải quyết và task độc lập vẫn làm được. Owner mốc cập nhật M0…M3 sau nghiệm thu.

Mẫu bàn giao:

~~~text
Task ID / owner / reviewer:
Branch / revision:
Đầu ra đã bàn giao:
Endpoint / payload / demo IDs hoặc đường dẫn UI:
Lệnh kiểm tra / thao tác browser:
Expected / actual / kết quả:
Live / seeded / mocked / phần chưa làm:
Task người nhận đã được mở dependency:
Known issue / owner xử lý:
~~~

BE cập nhật api.md, architecture.md, runbook.md; FE cập nhật hành trình/thao tác demo-script.md; owner INT-02 ghi kết quả/limitation; INT-03 xác nhận script cuối. Quyết định contract phải có trong tài liệu.

**Trạng thái handoff:** nhận PRE-01, chuẩn bị draft PRE-02 và setup BE-08 ngay. Task implementation bắt đầu khi dependency của task đã bàn giao. Demo chưa nghiệm thu; người nhận cụ thể và lịch chờ người phụ trách demo điền.
