# Phần C – Thiết kế UI/UX

## Design system
- **Phong cách:** SaaS dashboard tối giản, nền xám rất nhạt, thẻ trắng bo 12px, viền mảnh; sidebar xanh rêu đậm.
- **Màu (token CSS trong `src/app/globals.css`, đổi cả light/dark):** primary teal `#0f766e` (dark `#2dd4bf`), danger/warning/success; trạng thái công dùng cặp nền-chữ riêng (đủ công xanh lá, thiếu công hổ phách, vắng đỏ, phép xanh dương, lễ tím, không lương xám).
- **Màu biểu đồ:** 5 màu phân loại theo thứ tự cố định + 1 màu “Khác”, đã kiểm tra bằng công cụ đánh giá bảng màu (độ sáng, độ bão hoà, phân biệt cho người mù màu, tương phản) ở cả nền sáng `#ffffff` và nền tối `#111c1b` – đạt mọi tiêu chí. Mỗi biểu đồ có chú giải (≥ 2 chuỗi), tooltip, một trục duy nhất, kèm **bảng dữ liệu** mở rộng.
- **Chữ:** Segoe UI / Be Vietnam Pro / Roboto (đủ dấu tiếng Việt), số dùng `tabular-nums`.
- **Component** (`src/components/ui`): Button, Input, Select, Textarea, Checkbox, Field (nhãn + lỗi), Card, StatCard, Badge, Table, Dialog, ConfirmDialog (có thể yêu cầu gõ xác nhận, ví dụ “KHOA”), Toast, Skeleton, EmptyState, Pagination, Tabs, Notice, Avatar. Dùng chung: `FilterBar` (lọc đồng bộ URL), `FormDialog` (form khai báo trường), `ActionButton` (thao tác có xác nhận).
- **Trạng thái giao diện:** skeleton khi tải (`loading.tsx`), empty state cho mọi danh sách, toast thành công/thất bại, lỗi từng trường từ máy chủ, xác nhận trước thao tác quan trọng (ngừng kích hoạt, khoá kỳ lương, xoá…), trang lỗi và trang “không có quyền”.
- **Định dạng Việt Nam:** ngày `dd/MM/yyyy`, giờ 24h, tiền `1.234.567 ₫`, múi giờ `Asia/Ho_Chi_Minh`; tìm kiếm không dấu.
- **Light/Dark mode:** nút mặt trời/mặt trăng trên topbar, lưu theo trình duyệt, mặc định theo hệ điều hành.

## Bố cục
- **Sidebar trái** (ẩn thành menu trượt trên điện thoại): Tổng quan · Cổng nhân viên · *Nhân sự* (Nhân viên, Phòng ban, Sơ đồ tổ chức) · *Thời gian* (Chấm công, Ca làm việc, Nghỉ phép, Phê duyệt) · *Lương & hiệu suất* (Tiền lương, KPI) · *Vòng đời* (Tuyển dụng, Tiếp nhận/nghỉ việc, Tài sản) · *Phân tích* (Báo cáo, HR Insights) · *Hệ thống* (Thông báo, Cài đặt). Mục chỉ hiện khi có quyền; số yêu cầu chờ duyệt/thông báo hiển thị dạng huy hiệu.
- **Topbar:** tìm nhân viên, chọn chi nhánh (người có phạm vi toàn công ty), đổi giao diện, chuông thông báo (danh sách nhanh), ảnh đại diện + menu tài khoản (hồ sơ, xác thực hai lớp, đổi mật khẩu, đăng xuất).

## Sitemap

```
/login                         Đăng nhập (+ bước mã xác thực)
/account/password | /account/security
/                              Dashboard
/me?tab=overview|schedule|timesheet|leave|payslips|kpi|requests|assets   Cổng nhân viên
/employees  /employees/new  /employees/[id]?tab=overview|contracts|salary|documents|history  /employees/print
/departments?tab=departments|branches|positions   /org-chart
/attendance?tab=timesheet|today|requests   /attendance/qr   /checkin?t=…   /shifts?tab=schedule|assign|shifts
/leave?tab=requests|calendar|balances|types   /approvals
/payroll  /payroll/[id]  /payroll/config  /payroll/payslip/[id]
/kpi?tab=period|compare|definitions
/recruitment  /recruitment/[id]
/lifecycle?type=ONBOARDING|OFFBOARDING  /lifecycle/[id]
/assets  /assets/handover/[id]
/reports?type=…  /reports/print   /insights   /notifications
/settings  /settings/users  /settings/roles  /settings/company?tab=…  /settings/holidays  /settings/audit  /settings/backup
```

## Màn hình chính
- **Dashboard:** 12 thẻ chỉ số (bấm để đi tới danh sách liên quan), biến động tuyển mới/nghỉ việc 12 tháng, tỷ lệ nghỉ việc, cơ cấu phòng ban, chấm công theo ngày (đúng giờ/đi muộn/thiếu giờ), chi phí nhân sự theo kỳ lương (chỉ người có quyền xem lương), KPI theo phòng ban, tỷ lệ giới tính, hợp đồng sắp hết hạn, sinh nhật.
- **Bảng công tháng:** lưới nhân viên × ngày, ký hiệu + màu + chấm báo đi muộn/tăng ca, cột tổng; bấm ô xem chi tiết hoặc sửa công (ghi lý do).
- **Hồ sơ nhân viên:** thẻ đầu trang (ảnh, mã, chức vụ, trạng thái, tài khoản) và các tab theo quyền.
- **Phê duyệt:** hộp duyệt tập trung (nghỉ phép, điều chỉnh công, tăng ca) hiển thị cấp duyệt, lý do, đính kèm.
- **Tiền lương:** quy trình trạng thái rõ ràng, cảnh báo trước khi duyệt, khoá yêu cầu gõ xác nhận.

## Responsive
Kiểm tra thực tế bằng trình duyệt headless ở 1440×900 và 390×844 (light/dark): không tràn ngang trang; bảng rộng cuộn ngang trong thẻ; sidebar thành menu trượt; form một cột trên điện thoại; dialog dạng bottom-sheet trên màn hình nhỏ; thẻ chấm công nút lớn cho thao tác một tay.
