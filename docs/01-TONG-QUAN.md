# Phần A – Tổng quan

## Tên ứng dụng
**HRM – Hệ thống quản lý nhân sự** (tên hiển thị lấy từ *Cài đặt → Cấu hình doanh nghiệp*).

## Mục tiêu
Quản lý tập trung vòng đời nhân viên (tuyển dụng → tiếp nhận → làm việc → chấm công, nghỉ phép, lương, KPI → nghỉ việc) trên một nền tảng; tự động hoá việc hành chính lặp lại; số liệu thời gian thực; phân quyền chặt theo vai trò **và phạm vi dữ liệu**.

## Giả định khi chưa có thông tin doanh nghiệp

| Hạng mục | Giả định | Thay đổi ở đâu |
|---|---|---|
| Quy mô | Doanh nghiệp vừa và nhỏ, 10–500 nhân viên, 1–5 chi nhánh | – |
| Nền tảng | Web app responsive (máy tính, điện thoại, máy tính bảng) | – |
| Triển khai | Docker trên VPS/máy chủ nội bộ, PostgreSQL | docs/06 |
| Lịch làm việc | Thứ 2–Thứ 6, ca hành chính 08:00–17:00, nghỉ trưa 60 phút | Cài đặt → Quy tắc chấm công; Ca làm việc |
| Chính sách phép | 12 ngày/năm + 1 ngày mỗi 5 năm thâm niên, năm đầu theo tỷ lệ; đơn ≥ 3 ngày duyệt 2 cấp | Cài đặt → Chính sách phép |
| Lương | Theo tháng (hỗ trợ theo ngày công, theo giờ); công thức cấu hình có phiên bản | Tiền lương → Cấu hình lương |
| Màu thương hiệu | Xanh teal `#0f766e` | `src/app/globals.css` |
| Email / máy chấm công | Chưa tích hợp | docs/07 |

> Các giá trị pháp lý (thuế TNCN, bảo hiểm, ngày phép, ngày lễ) **không được hệ thống tự giả định là đúng**. Cấu hình lương mẫu ở trạng thái *Nháp – chưa xác minh* và phải được kế toán kiểm tra, ghi căn cứ rồi mới kích hoạt.

## Nhóm người dùng (vai trò mặc định)

| Vai trò | Mô tả |
|---|---|
| Super Admin | Toàn quyền hệ thống, quản trị phân quyền |
| Ban giám đốc | Xem toàn công ty, duyệt yêu cầu, **duyệt & khoá kỳ lương** |
| HR Admin | Quản trị nhân sự toàn công ty, tài khoản, cấu hình, tuyển dụng, tính lương nháp |
| Trưởng phòng | Xem/duyệt/giao KPI trong phòng ban mình (kể cả phòng ban con) |
| Kế toán tiền lương | Tính lương, cấu hình công thức, xuất bảng lương (không tự duyệt) |
| Nhân viên | Cổng tự phục vụ: hồ sơ, chấm công, đơn nghỉ, phiếu lương, KPI |

Có thể tạo vai trò tuỳ chỉnh và chỉnh ma trận quyền tại *Cài đặt → Phân quyền*.

## Danh sách tính năng (14 module)
1. Dashboard tổng quan – 12 chỉ số, 7 biểu đồ, lọc theo tháng/phòng ban/chi nhánh/trạng thái.
2. Hồ sơ nhân viên – thêm/sửa/xem/ngừng kích hoạt, tìm kiếm không dấu, lọc, nhập/xuất Excel, in/PDF, ảnh & tài liệu, hợp đồng, lương, lịch sử thay đổi.
3. Phòng ban, chi nhánh, chức vụ, trưởng phòng, phân bổ nhân sự, sơ đồ tổ chức dạng cây.
4. Chấm công – web/QR (đổi mỗi 60 giây)/GPS (tuỳ chọn), ca cố định/xoay/qua đêm, phân ca, bảng công tháng, sửa công, đề nghị điều chỉnh, tăng ca, xuất bảng công.
5. Nghỉ phép – đơn nghỉ cả ngày/nửa ngày/nhiều ngày, đính kèm, duyệt 1–2 cấp, số dư phép tự động, lịch nghỉ, loại nghỉ & chính sách.
6. Tiền lương – kỳ lương, tổng hợp công, tính nháp, kiểm tra, duyệt, khoá, xuất Excel/file chuyển khoản, phiếu lương in/PDF, cấu hình công thức có phiên bản.
7. KPI – định nghĩa, giao theo nhân viên/phòng ban, trọng số, cập nhật kết quả, đánh giá, chốt, so sánh kỳ.
8. Tuyển dụng – vị trí, ứng viên & CV, pipeline theo giai đoạn, phỏng vấn, thư theo mẫu, tiếp nhận thành nhân viên.
9. Tiếp nhận / nghỉ việc – checklist từ mẫu, người hướng dẫn, giao việc, hạn chót, chặn hoàn tất khi còn giữ tài sản.
10. Tài sản – mã, loại, tình trạng, bàn giao/thu hồi, lịch sử, biên bản in.
11. Thông báo trong ứng dụng & tác vụ tự động (hợp đồng, sinh nhật, thiếu chấm công, nhắc duyệt, KPI, đầu việc quá hạn).
12. Cổng nhân viên (ESS).
13. Báo cáo – 10 loại, lọc, so sánh kỳ trước, biểu đồ, xuất Excel/PDF.
14. Quản trị – tài khoản, phân quyền, cấu hình, ngày lễ, nhật ký, sao lưu; HR Insights.

## Phạm vi MVP (đã hoàn thành và kiểm thử)
Đăng nhập + MFA + phân quyền theo phạm vi, Dashboard, Nhân viên, Phòng ban, Chấm công, Nghỉ phép, Phê duyệt, Thông báo, Báo cáo, Quản trị hệ thống.
Giai đoạn 4 (Tiền lương, KPI, Tuyển dụng, Tiếp nhận/nghỉ việc, Tài sản, HR Insights) cũng đã được xây dựng và kiểm thử – xem danh sách đầy đủ và giới hạn tại docs/07.
