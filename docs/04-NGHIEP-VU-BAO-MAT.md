# Phần D – Nghiệp vụ chính, API, xác thực & bảo mật

Mã nguồn đầy đủ trong thư mục `src/`; schema trong `prisma/schema.prisma`; migration trong `prisma/migrations/`. Tài liệu API OpenAPI 3.1: `GET /api/openapi`.

## 1. Xác thực
- Mật khẩu băm **bcrypt (12 vòng)**; so sánh với hash giả khi email không tồn tại để không lộ thời gian phản hồi; thông báo lỗi chung “Email hoặc mật khẩu không đúng”.
- Khoá tạm tài khoản sau `lockoutThreshold` lần sai (mặc định 5 lần/15 phút) + giới hạn **30 lần đăng nhập sai**/10 phút theo IP (chỉ áp dụng khi biết IP thật qua reverse proxy; lần đăng nhập đúng không bị tính) + chốt an toàn 500 lần sai/10 phút toàn hệ thống.
- **Phiên** lưu DB: token ngẫu nhiên 32 byte trong cookie `hrm_session` (HttpOnly, SameSite=Lax, Secure khi `COOKIE_SECURE=true`); DB chỉ lưu SHA-256 của token; hết hạn sau `SESSION_TTL_HOURS`; thu hồi được (đăng xuất, đổi mật khẩu, khoá tài khoản, quản trị viên thu hồi).
- **Xác thực hai lớp (TOTP RFC 6238)** cho mọi tài khoản; tuỳ chọn *bắt buộc với tài khoản đặc quyền* (Super Admin, HR, Kế toán lương, Ban giám đốc) – khi bật, người dùng bị chuyển tới trang thiết lập trước khi dùng hệ thống.
- Mật khẩu tạm (tạo tài khoản/đặt lại) sinh ngẫu nhiên, hiển thị 1 lần, **bắt buộc đổi** ở lần đăng nhập đầu; chính sách độ dài + chữ hoa/thường/số.

## 2. Phân quyền (RBAC + phạm vi dữ liệu)
- `src/lib/rbac.ts`: `can()`, `requirePerm()`, `canAccessEmployee()` (kiểm tra 1 nhân viên), `employeeScopeWhere()` (điều kiện Prisma lọc danh sách). Phạm vi được áp dụng cho **mọi** truy vấn liên quan nhân viên: danh sách, chi tiết, bảng công, đơn nghỉ, KPI, báo cáo, insights, xuất file.
- Hồ sơ chi tiết trả về theo **nhóm trường**: công việc / cá nhân nhạy cảm / lương / hợp đồng / tài liệu / lịch sử – mỗi nhóm một quyền riêng.
- File chỉ phục vụ qua API có kiểm tra quyền; ảnh đại diện xem được trong sơ đồ tổ chức; giấy tờ đơn nghỉ xem được bởi người duyệt; CV chỉ bởi người có quyền tuyển dụng.

## 3. Chấm công (`attendance-calc.ts`, `services/attendance.ts`)
- **Ca:** giờ bắt đầu/kết thúc (kết thúc ≤ bắt đầu ⇒ ca qua đêm, kết thúc ngày hôm sau), nghỉ giữa ca, ngưỡng đi muộn/về sớm, giá trị công.
- **Chọn ca cho ngày:** phân ca 1 ngày (ca xoay/đổi ca) > phân ca theo khoảng ngày + thứ trong tuần (mới nhất) > ca mặc định công ty vào ngày làm việc; phân ca “nghỉ” = ngày nghỉ.
- **Tính công:** giờ làm = phần giao giữa [vào, ra] và khung ca, trừ nghỉ giữa ca nếu làm quá nửa khung; trong ngưỡng cho phép = đủ công; ngoài ngưỡng = công theo tỷ lệ; thiếu giờ vào/ra = 0 công (hoặc ½ theo cấu hình) cho tới khi duyệt điều chỉnh.
- **Ca qua đêm:** chấm vào sau nửa đêm thuộc ca đêm hôm trước được tính cho ngày hôm trước; chấm ra tìm bản ghi đang mở trong 20 giờ.
- **QR:** mã HMAC đổi mỗi 60 giây (chấp nhận 1 bước trước) gắn chi nhánh – chống chụp mã dùng lại. **GPS** (tắt mặc định): kiểm tra khoảng cách tới toạ độ chi nhánh, chỉ lưu toạ độ khi bật, có thông báo cho nhân viên.
- **Trạng thái ngày:** Đủ công, Thiếu công, Thiếu giờ vào/ra, Đang làm, Chưa chấm công, Nghỉ phép, Nghỉ nửa ngày, Nghỉ không lương, Nghỉ lễ, Ngày nghỉ, cộng dấu tăng ca/đi muộn.

## 4. Nghỉ phép (`leave-calc.ts`, `services/leave.ts`)
- Số ngày = ngày làm việc **theo lịch ca của chính nhân viên**, trừ ngày lễ; nửa ngày = 0,5.
- Kiểm tra: loại nghỉ hợp lệ, bắt buộc đính kèm theo loại, không trùng đơn khác, không vượt năm, đủ phép (tính cả đơn đang chờ) trừ khi cho phép âm phép.
- Phép năm khởi tạo theo chính sách (cơ bản + thâm niên, năm đầu theo tỷ lệ); điều chỉnh có lý do và nhật ký.
- Duyệt cuối ⇒ trừ phép trong cùng giao dịch; huỷ đơn đã duyệt (chưa bắt đầu, hoặc HR) ⇒ hoàn phép. Đơn đã duyệt tự hiện trên bảng công.

## 5. Phê duyệt nhiều cấp (`services/approval.ts`)
- Dùng chung cho nghỉ phép, điều chỉnh công, tăng ca. Số cấp: phép ≥ N ngày (mặc định 3) cần 2 cấp; tăng ca theo cấu hình.
- Cấp 1: người có quyền duyệt bao phủ nhân viên (trưởng phòng/HR). Cấp 2: quyền duyệt toàn công ty. Không tự duyệt, không duyệt 2 cấp, từ chối bắt buộc lý do.
- Khoá lạc quan (`status + currentLevel`) chống 2 người duyệt cùng lúc; áp dụng kết quả (trừ phép, ghi công điều chỉnh) trong cùng giao dịch; chặn khi kỳ lương liên quan đã khoá; thông báo người duyệt cấp tiếp theo và người gửi.

## 6. Tiền lương (`payroll-calc.ts`, `services/payroll.ts`)
- **Cấu hình có phiên bản:** tỷ lệ BHXH/BHYT/BHTN (người lao động, doanh nghiệp), trần đóng, không đóng khi nghỉ không lương ≥ N ngày, giảm trừ bản thân/người phụ thuộc, biểu thuế luỹ tiến (số bậc tuỳ ý), miễn thuế phần chênh lệch tăng ca, hệ số tăng ca ngày thường/nghỉ tuần/lễ, giờ/ngày, công chuẩn theo lịch hoặc cố định. Bản nháp sửa được; kích hoạt bắt buộc ghi căn cứ ≥ 20 ký tự và **chạy thử công thức**; kỳ lương lưu phiên bản đã dùng.
- **Công thức:** lương theo công = lương cơ bản × (công thực tế + phép có lương + lễ) / công chuẩn (theo tháng) – hoặc × ngày công (theo ngày) – hoặc × giờ (theo giờ); + tăng ca (lương giờ × giờ × hệ số) + phụ cấp + thưởng/hoa hồng; BH theo lương đóng BH có trần; thu nhập tính thuế = thu nhập chịu thuế − BH − giảm trừ gia cảnh; thuế luỹ tiến; tạm ứng/khấu trừ trừ sau thuế.
- **Quy trình:** Nháp → Tính (cảnh báo: thiếu lương cơ bản, thực lĩnh âm, ngày thiếu giờ, kỳ chưa kết thúc) → Duyệt (**người tính không tự duyệt**) → Khoá & phát hành (gõ “KHOA” xác nhận; nhân viên nhận thông báo, xem phiếu). Kỳ khoá bất biến.

## 7. Thông báo & tự động hoá (`services/automation.ts`)
Chạy mỗi 30 phút (bộ lập lịch nội bộ) hoặc qua cron `POST /api/cron/daily` (header `x-cron-secret`). Idempotent nhờ `dedupeKey`. Chỉ tạo **thông báo trong ứng dụng**; không gửi email/kênh ngoài; không tự ra quyết định nhân sự (chỉ đánh dấu hợp đồng quá hạn là “Hết hạn” – bảo trì dữ liệu).

## 8. Bảo mật & bảo vệ dữ liệu cá nhân
| Biện pháp | Triển khai |
|---|---|
| Chống SQL injection | Prisma (truy vấn tham số hoá), không ghép chuỗi SQL |
| Chống XSS | React tự escape; không dùng `dangerouslySetInnerHTML` cho dữ liệu người dùng; CSP `default-src 'self'`, `frame-ancestors 'none'` |
| Chống CSRF | Cookie SameSite=Lax + kiểm tra `Origin`/`Sec-Fetch-Site` cho mọi request thay đổi dữ liệu; mọi thay đổi đều là POST/PUT/PATCH/DELETE |
| Validate đầu vào | Zod ở mọi API, lỗi trả về theo từng trường |
| Upload | Kiểm tra chữ ký file, phần mở rộng, 10MB, tên file làm sạch, lưu ngoài thư mục public, tên lưu ngẫu nhiên |
| Dữ liệu nhạy cảm | Mã hoá AES-256-GCM (CCCD, số tài khoản, TOTP), che khi hiển thị (bấm để xem), tách quyền xem |
| Nhật ký | Đăng nhập/thất bại, chỉnh sửa (diff), phê duyệt, xuất dữ liệu, xem phiếu lương người khác; **giá trị lương, CCCD, tài khoản, địa chỉ… chỉ ghi “đã thay đổi”**; log máy chủ không ghi body/lỗi chi tiết |
| Header | X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, ẩn X-Powered-By |
| Bí mật | Chỉ qua biến môi trường; `setup-env.mjs` sinh ngẫu nhiên; không có mật khẩu viết cứng (cả dữ liệu demo) |

> Thiết kế hỗ trợ rà soát theo Bộ luật Lao động 2019 và Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân (mã hoá, phân quyền tối thiểu, nhật ký, thông báo khi thu thập vị trí, giới tính không bắt buộc) – **chưa được đánh giá tuân thủ pháp lý chính thức**.
