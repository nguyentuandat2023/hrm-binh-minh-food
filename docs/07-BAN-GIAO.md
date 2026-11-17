# Phần G – Bàn giao

## 1. Hướng dẫn cho Quản trị hệ thống (Super Admin)
1. **Đăng nhập lần đầu** bằng tài khoản tạo từ `create-admin` → đổi mật khẩu → *menu tài khoản → Xác thực hai lớp* → quét QR bằng Google/Microsoft Authenticator.
2. **Cài đặt → Bảo mật:** bật “Bắt buộc xác thực hai lớp cho tài khoản đặc quyền”; chỉnh độ dài mật khẩu, ngưỡng khoá.
3. **Cài đặt → Tài khoản:** *Tạo tài khoản* (chọn hồ sơ nhân viên, email, vai trò) → hệ thống hiển thị **mật khẩu tạm 1 lần** – gửi cho người dùng qua kênh an toàn. Menu “⋯” trên từng dòng: gán vai trò, đặt lại mật khẩu, thu hồi phiên, đặt lại 2FA (khi mất điện thoại), khoá/mở khoá.
4. **Cài đặt → Phân quyền:** chọn vai trò → chỉnh phạm vi từng ô (Không / Bản thân / Nhóm / Phòng / Chi nhánh / Công ty) → *Lưu thay đổi*. *Thêm vai trò* có thể sao chép từ vai trò sẵn có.
5. **Cài đặt → Nhật ký hệ thống:** lọc theo loại (đăng nhập, chỉnh sửa, phê duyệt, xuất dữ liệu), thời gian; xuất Excel.
6. **Cài đặt → Sao lưu & khôi phục:** theo dõi bản sao lưu, chạy ngay tác vụ tự động.
7. Khi người dùng quên mật khẩu: *Đặt lại mật khẩu* (không có tính năng tự khôi phục qua email vì chưa tích hợp email).

## 2. Hướng dẫn cho HR
- **Thiết lập ban đầu:** *Phòng ban* (tab Chi nhánh, Chức vụ, Phòng ban – gán trưởng phòng, phân bổ nhân viên) → *Ca làm việc* (danh mục ca, phân ca, lịch tuần) → *Cài đặt → Cấu hình doanh nghiệp* (ngày làm việc, ca mặc định, QR/GPS, chính sách phép) → *Ngày nghỉ lễ*.
- **Nhân viên:** *Thêm nhân viên* (mã tự sinh) hoặc *Nhập Excel* (tải file mẫu → điền → *Kiểm tra file* → *Nhập*; file có dòng lỗi sẽ không được nhập). Trong hồ sơ: sửa thông tin công việc/cá nhân, hợp đồng (thêm, gia hạn, chấm dứt), lương & phụ cấp (điều chỉnh lương cần ngày hiệu lực + lý do), tài liệu, lịch sử thay đổi, ngừng kích hoạt (giữ dữ liệu, khoá tài khoản).
- **Chấm công:** đặt màn hình *Màn hình QR* tại cửa ra vào; xem *Bảng công tháng*, bấm ô để sửa công (bắt buộc lý do); tab *Hôm nay* xem ai chưa chấm; *Xuất bảng công*.
- **Nghỉ phép:** tab *Số ngày phép* → *Khởi tạo phép năm* đầu năm, *Điều chỉnh* khi cần; tab *Lịch nghỉ*; tạo đơn thay nhân viên; huỷ đơn đã duyệt (hoàn phép).
- **Phê duyệt:** mục *Phê duyệt* – duyệt cấp 2 với đơn nghỉ dài.
- **Tuyển dụng:** *Thêm vị trí* → mở vị trí → *Thêm ứng viên* (kèm CV) → bấm ứng viên để chuyển giai đoạn, chấm sao, ghi chú, lên lịch & ghi kết quả phỏng vấn, sinh thư mời theo mẫu (sao chép để gửi) → ở giai đoạn *Đề nghị tuyển dụng*: *Tiếp nhận làm nhân viên* (tạo hồ sơ thử việc + checklist tiếp nhận).
- **Tiếp nhận / nghỉ việc:** đánh dấu từng đầu việc, phân công, hạn; *Hoàn tất* – nghỉ việc chỉ hoàn tất khi đã thu hồi tài sản; HR tự chọn chuyển “Đã nghỉ việc” và khoá tài khoản.
- **Tài sản:** thêm, bàn giao, thu hồi, *Lịch sử → In biên bản*.
- **Báo cáo / HR Insights:** chọn loại báo cáo, khoảng tháng, so sánh kỳ trước, xuất Excel hoặc In/PDF; HR Insights liệt kê việc cần xử lý, bất thường chấm công, hồ sơ thiếu thông tin, hợp đồng.

## 3. Hướng dẫn cho Kế toán tiền lương & Ban giám đốc
1. Kế toán: *Tiền lương → Cấu hình lương* – kiểm tra từng tham số theo văn bản hiện hành → *Xác minh & kích hoạt* (ghi căn cứ). Khi luật thay đổi: *Sao chép thành bản mới*, sửa, đặt ngày hiệu lực, kích hoạt.
2. Đầu tháng: *Tạo kỳ lương* (tháng trước) → tab *Thưởng / khấu trừ* nhập thưởng, hoa hồng, tạm ứng… → *Tính lương* → đọc cảnh báo, kiểm tra từng dòng/phiếu lương.
3. Ban giám đốc: *Duyệt bảng lương* → *Khoá & phát hành phiếu lương* (gõ KHOA). Sau khi khoá, nhân viên nhận thông báo và xem phiếu; kỳ lương và dữ liệu công trong kỳ không sửa được.
4. Xuất *Bảng lương* hoặc *File chuyển khoản* (kèm số tài khoản – thao tác được ghi nhật ký).

## 4. Hướng dẫn cho Trưởng phòng
- *Phê duyệt*: duyệt/từ chối đơn nghỉ, điều chỉnh công, tăng ca của nhân viên trong phòng (từ chối phải có lý do).
- *Chấm công*, *Nghỉ phép*, *Nhân viên*, *Báo cáo*: chỉ thấy dữ liệu phòng mình (không thấy lương, CCCD).
- *KPI*: *Giao KPI* (chọn chỉ tiêu, kỳ, mục tiêu, trọng số, nhân viên hoặc cả phòng) → theo dõi → *Đánh giá* (điểm, nhận xét) → *Chốt*; tab *So sánh kỳ*.

## 5. Hướng dẫn cho Nhân viên
- Đăng nhập (đổi mật khẩu tạm ở lần đầu) → **Cổng nhân viên**:
  - *Tổng quan*: bấm **Vào ca / Ra ca**, hoặc quét **mã QR** tại văn phòng bằng điện thoại (đã đăng nhập).
  - *Lịch làm việc*: ca 14 ngày tới. *Bảng công*: từng ngày, đi muộn, thiếu giờ.
  - *Nghỉ phép*: **Tạo đơn nghỉ** – hệ thống tự tính số ngày (bỏ cuối tuần, lễ) và cho biết phép còn lại; theo dõi trạng thái; huỷ đơn chưa bắt đầu.
  - *Điều chỉnh công & tăng ca*: gửi đề nghị khi quên chấm công / đăng ký làm thêm giờ.
  - *Phiếu lương*: xem và in/lưu PDF khi kỳ lương đã phát hành. *KPI*: cập nhật kết quả. *Tài sản*: thiết bị đang giữ.
  - *Cập nhật liên hệ*: điện thoại, địa chỉ, liên hệ khẩn cấp (thông tin khác do HR cập nhật).
- Chuông thông báo: đơn được duyệt/từ chối, phiếu lương, nhắc chấm công, KPI…

## 6. Chức năng đã hoàn thành
Tất cả 14 module trong yêu cầu đã có giao diện + API + CSDL + kiểm thử (xem docs/05): Dashboard; Hồ sơ nhân viên (CRUD, ngừng kích hoạt, tìm kiếm không dấu, lọc, phân trang, nhập/xuất Excel, in/PDF, ảnh & tài liệu, hợp đồng & gia hạn, lương & phụ cấp & lịch sử điều chỉnh, lịch sử thay đổi); Phòng ban/chi nhánh/chức vụ/sơ đồ tổ chức; Chấm công (web/QR/GPS tuỳ chọn, ca cố định/xoay/qua đêm, phân ca, lịch tuần, bảng công tháng, sửa công, điều chỉnh, tăng ca, xuất); Nghỉ phép; Phê duyệt 1–2 cấp; Tiền lương (cấu hình phiên bản, tính, duyệt, khoá, xuất, phiếu lương); KPI; Tuyển dụng; Tiếp nhận/nghỉ việc; Tài sản; Thông báo trong ứng dụng + 9 tác vụ tự động; Cổng nhân viên; 10 báo cáo; Quản trị (tài khoản, ma trận quyền theo phạm vi, cấu hình, ngày lễ, nhật ký, sao lưu); HR Insights; MFA; OpenAPI; Docker.

## 7. Chức năng CHƯA hoàn thành / giới hạn hiện tại
| Hạng mục | Tình trạng |
|---|---|
| Gửi email / Zalo / SMS | **Chưa tích hợp.** Chỉ có thông báo trong ứng dụng; thư tuyển dụng sinh nội dung để sao chép. Quên mật khẩu phải nhờ quản trị đặt lại |
| Máy chấm công vân tay/khuôn mặt | Chưa tích hợp (có thể bổ sung API nhập dữ liệu chấm công) |
| Ứng dụng di động gốc (iOS/Android) | Chưa có – dùng web responsive trên điện thoại |
| PDF tạo phía máy chủ | Không có – xuất PDF bằng chức năng In của trình duyệt |
| Lưu file trên S3/MinIO | Chưa – lưu trên đĩa/volume |
| Báo cáo BHXH (mẫu D02-TS…), quyết toán thuế TNCN năm, thuế người không cư trú, lương tháng 13 tự động | Chưa |
| Nhiều lượt chấm công trong ngày (ca gãy) | Chưa – 1 bản ghi công/ngày/nhân viên |
| Đơn nghỉ vắt qua 2 năm | Phải tách 2 đơn |
| Quy trình duyệt cấu hình động (> 2 cấp, theo sơ đồ tuỳ ý) | Chưa – cố định 1–2 cấp |
| Trang tuyển dụng công khai cho ứng viên tự nộp hồ sơ | Chưa – HR nhập ứng viên |
| Xử lý yêu cầu xoá/xuất dữ liệu cá nhân của chủ thể dữ liệu (NĐ 13) | Chưa có chức năng riêng – xử lý thủ công |
| Chính sách lưu trữ & tự xoá dữ liệu theo thời hạn | Chưa tự động – chỉ ngừng kích hoạt/xoá mềm |
| Kiểm thử Docker, sao lưu pg_dump, GPS/QR trên thiết bị thật | Chưa thực hiện trên máy phát triển (xem docs/05) |
| Đa ngôn ngữ | Chỉ tiếng Việt |
| ESLint / kiểm thử giao diện tự động trong CI | Chưa cấu hình |

## 8. Rủi ro & lưu ý vận hành
1. **Giá trị pháp lý chưa xác minh:** tỷ lệ bảo hiểm, trần đóng, giảm trừ gia cảnh, biểu thuế, hệ số tăng ca (cấu hình lương mẫu), ngày phép, ngày lễ (Tết, Giỗ Tổ…) **phải được kế toán/HR/pháp chế đối chiếu văn bản hiện hành** trước khi dùng. Hệ thống không tuyên bố tuân thủ pháp luật.
2. **Khoá mã hoá `DATA_ENCRYPTION_KEY`:** mất khoá ⇒ không đọc được CCCD, số tài khoản, 2FA. Sao lưu khoá ở nơi an toàn, tách khỏi bản sao lưu DB; không đổi khoá khi đã có dữ liệu.
3. **Một instance:** giới hạn đăng nhập theo IP và bộ lập lịch chạy trong bộ nhớ một tiến trình. Khi chạy nhiều instance: tắt bộ lập lịch nội bộ, dùng cron; cân nhắc rate-limit ở reverse proxy.
4. **Reverse proxy** phải ghi đè `X-Forwarded-For` và chỉ mở ứng dụng qua HTTPS (`COOKIE_SECURE=true`).
5. **Dữ liệu demo** chỉ dùng thử nghiệm; cài đặt thật dùng `db:seed` + `create-admin`.
6. **GPS:** chỉ bật khi doanh nghiệp có cơ sở xử lý dữ liệu vị trí và đã thông báo cho nhân viên.
7. **Kỳ lương đã khoá là bất biến:** sai sót phát hiện sau khi khoá cần xử lý ở kỳ sau (khoản điều chỉnh/truy thu/truy lĩnh).
8. **Sao lưu:** kiểm tra khôi phục định kỳ; trang Sao lưu cảnh báo khi quá 36 giờ chưa có bản mới.
9. **Gợi ý HR Insights/KPI** chỉ để tham khảo – quyết định đánh giá, kỷ luật, tuyển dụng, chấm dứt hợp đồng luôn do con người thực hiện.
