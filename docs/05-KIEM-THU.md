# Phần E – Kiểm thử

## Cách chạy
```bash
npm test             # kiểm thử đơn vị (Vitest)
npm run typecheck    # kiểm tra kiểu TypeScript
npm run test:smoke   # end-to-end qua HTTP – cần server đang chạy và dữ liệu demo (npm run db:seed:demo)
```
Bộ end-to-end chạy lặp lại được trên cùng một DB (tự dọn dữ liệu tạm của lần trước).

## Kết quả (17/11/2026, Windows 10, Node 26, PostgreSQL 18)
| Bộ kiểm thử | Kết quả |
|---|---|
| TypeScript `tsc --noEmit` | Không lỗi |
| `next build` (production, standalone) | Thành công |
| Kiểm thử đơn vị (7 file) | **87/87 đạt** |
| End-to-end trên server dev | **134/134 đạt** |
| End-to-end trên bản build production (standalone) | **134/134 đạt** |
| Kiểm tra giao diện (Edge headless, 1440×900 & 390×844, light/dark) | Không tràn ngang; lỗi hiển thị phát hiện đã sửa (xem dưới) |

## Kiểm thử đơn vị (`tests/`)
- **Chấm công:** ca qua đêm (khung giờ, đủ công, về sớm), đi muộn trong/ngoài ngưỡng, nửa ngày, thiếu giờ ra (chính sách 0 / ½), giờ ra trước giờ vào, xác định ngày công khi vào sau nửa đêm, ưu tiên phân ca (1 ngày > khoảng > mặc định), ca xoay theo thứ, phân “nghỉ”, các trạng thái ô bảng công.
- **Nghỉ phép:** bỏ cuối tuần, bỏ ngày lễ, nửa ngày, nửa ngày nhiều ngày bị từ chối, phép năm cơ bản/thâm niên 5–10 năm/năm đầu theo tỷ lệ, số còn lại trừ đơn chờ.
- **Tiền lương:** thuế luỹ tiến từng bậc, đủ công, thiếu công, trần BH, không đóng BH khi nghỉ không lương ≥ 14 ngày, người phụ thuộc, miễn thuế phần tăng ca, phụ cấp không chịu thuế, tạm ứng trừ sau thuế, thưởng, lương theo giờ, theo ngày, cấu hình sai (bậc cuối, thứ tự bậc).
- **Phân quyền & phê duyệt:** phạm vi Bản thân/Nhóm/Phòng/Chi nhánh/Công ty, gộp vai trò, không có quyền → lỗi; không tự duyệt, ngoài phạm vi, cấp 2 cần toàn công ty, không duyệt 2 cấp, yêu cầu đã xử lý.
- **Bảo mật:** mã hoá/giải mã, phát hiện bản mã bị sửa, blind index, che số, TOTP theo **vector chuẩn RFC 6238**, lệch giờ, mã QR hết hạn/giả mạo, nhật ký không lộ lương/CCCD/địa chỉ.
- **Khác:** KPI (cao/thấp tốt, trần 150%, trọng số), ngày giờ VN (qua nửa đêm UTC, năm nhuận), định dạng, ma trận quyền chỉ tham chiếu quyền tồn tại.

## Kiểm thử end-to-end (`scripts/smoke-*.mjs`) – các ca chính
| Nhóm | Ca kiểm thử |
|---|---|
| Xác thực | Chưa đăng nhập → chuyển /login; API → 401; sai mật khẩu → thông báo chung; POST từ Origin lạ → 403 (CSRF); 23 trang quản trị → 200 |
| Phân quyền | Nhân viên chỉ thấy hồ sơ mình; xem đồng nghiệp → 403; trang lương/insights → chuyển /forbidden **và HTML không chứa dữ liệu**; API quản trị → 403; tự sửa phòng ban → 403; trưởng phòng chỉ thấy phòng mình, không thấy lương/CCCD; kế toán thấy lương; HR không thao tác được Super Admin, không tự đổi vai trò |
| Hồ sơ | Tìm kiếm không dấu; tạo nhân viên (mã tự sinh); trùng CCCD → 409; thiếu trường → 400 có lỗi trường; lịch sử ghi thay đổi, không lộ CCCD; file giả PDF bị chặn; nhân viên khác không tải được tài liệu; ngừng kích hoạt/kích hoạt lại; **nhập Excel**: phát hiện dòng lỗi, không nhập khi còn lỗi, nhập dòng hợp lệ; xuất Excel |
| Nghỉ phép | Xem trước 3 ngày (T2–T4); gửi đơn → cần 2 cấp; trùng thời gian → 409; trưởng phòng khác không thấy; không tự duyệt; cấp 1 trưởng phòng → vẫn chờ; trưởng phòng không duyệt tiếp cấp 2; từ chối cần lý do; HR duyệt cấp 2 → trừ 3 ngày; duyệt lại → 409; huỷ → hoàn phép; nửa ngày = 0,5; không đủ phép → 400 |
| Chấm công | Chấm web; QR giả → 400; QR kiosk hợp lệ → chấp nhận; điều chỉnh công → duyệt → bảng công cập nhật; điều chỉnh ngày tương lai → 400; tăng ca qua nửa đêm; trùng giờ tăng ca → 409; nhân viên không sửa trực tiếp công → 403; xuất bảng công |
| Tự động hoá | Chạy 2 lần không tạo thông báo trùng; HR nhận cảnh báo hợp đồng; cron sai secret → 401 |
| Báo cáo | 10 loại báo cáo; trưởng phòng không thấy báo cáo lương |
| Tiền lương | Chưa kích hoạt cấu hình → không tính; ghi chú xác minh quá ngắn → 400; kích hoạt có chạy thử; thưởng; tính lương; kế toán duyệt → 403; khoá khi chưa duyệt → 409; giám đốc duyệt & khoá; **kỳ đã khoá**: không tính lại, không thêm khoản, HR không sửa công, nhân viên không gửi điều chỉnh; nhân viên nhận thông báo và xem phiếu; đồng nghiệp không xem được phiếu; xuất bảng lương; **người tính không tự duyệt** |
| KPI | Trưởng phòng tạo KPI; trưởng phòng khác giao cho NV phòng KD → 403; giao KPI; nhân viên cập nhật kết quả; tự đánh giá → 403; trưởng phòng đánh giá; cập nhật sau đánh giá → 409 |
| Tuyển dụng | Trưởng phòng tạo vị trí → 403; HR tạo vị trí + ứng viên kèm CV; tiếp nhận khi chưa Đề nghị → 400; phỏng vấn, chuyển Đề nghị, sinh thư mẫu; tiếp nhận → hồ sơ + checklist; tiếp nhận lần 2 → 409 |
| Tài sản & nghỉ việc | Thêm & bàn giao; bàn giao trùng → 409; hoàn tất khi còn việc → 409; hoàn tất khi còn giữ tài sản → 409; thu hồi → hoàn tất (chuyển Đã nghỉ việc, khoá tài khoản) |
| Trang | Mọi trang giai đoạn 4 (admin) và mọi tab cổng nhân viên → 200 |

## Lỗi phát hiện trong quá trình phát triển và trạng thái
| # | Lỗi / rủi ro | Mức | Trạng thái |
|---|---|---|---|
| 1 | Thiết lập MFA dùng GET (có thể bị trang ngoài kích hoạt) | Trung bình | Đã sửa – chuyển sang POST có kiểm tra Origin |
| 2 | Người không phải Super Admin có thể gán vai trò chứa quyền sửa phân quyền | Cao | Đã sửa – chặn + kiểm thử |
| 3 | Duyệt phép/điều chỉnh công/tăng ca vào kỳ lương đã khoá | Cao | Đã sửa – chặn ở bước duyệt và bước gửi |
| 4 | CV ứng viên xem được bởi người có quyền duyệt phép | Trung bình | Đã sửa – chỉ quyền tuyển dụng |
| 5 | Tổng giờ tăng ca tháng tính sai khoảng ngày | Thấp | Đã sửa |
| 6 | Bản build standalone thiếu file phụ thuộc của exceljs → xuất Excel lỗi 500 | Cao (chỉ production) | Đã sửa (`outputFileTracingIncludes`) – phát hiện nhờ chạy kiểm thử trên bản production |
| 7 | File route/page export hàm phụ (không hợp lệ với Next build) | Build | Đã sửa |
| 8 | Ô chọn số trong cấu hình gửi chuỗi | Thấp | Đã sửa |
| 9 | Thẻ thống kê cắt chữ/tràn số ở 1440px; ô tháng trống | Giao diện | Đã sửa |
| 10 | Nút “Vào ca” còn bấm được sau khi đã chấm đủ | Thấp | Đã sửa |
| 12 | Giới hạn đăng nhập đếm cả lần đúng và gộp mọi người chung một hạn mức khi không có reverse proxy → sau ~30 lần đăng nhập trong 10 phút, **mọi người** bị chặn (“Quá nhiều lần thử”). Phát hiện khi người dùng thử nghiệm không đăng nhập được | Cao | Đã sửa – chỉ đếm lần sai, theo IP khi biết IP; thêm kiểm thử 35 lần đăng nhập liên tiếp |
| 13 | Trên Railway, `APP_URL="https://${{RAILWAY_PUBLIC_DOMAIN}}"` thành `"https://"` khi chưa cấp tên miền → `new URL()` ném lỗi → mọi thao tác POST (kể cả đăng nhập) trả 500; link QR thành `https:///checkin` | Cao | Đã sửa – đọc APP_URL an toàn (`src/lib/app-url.ts`), QR dùng Host do proxy chuyển tới; thêm kiểm thử đơn vị; build lại không có `.env` (như Railway) thành công |
| 11 | Trang bị chặn quyền trả HTTP 200 kèm chỉ thị chuyển hướng (do streaming/Suspense) thay vì 307 | Thông tin | Chấp nhận – đã kiểm chứng không lộ dữ liệu; API vẫn trả 403 |

## Chưa kiểm thử trên máy này
- `docker compose up` (Docker daemon không chạy trên máy phát triển) – Dockerfile/compose cần chạy thử trên máy chủ đích.
- `scripts/backup.sh`, `restore-test.sh`, `npm run backup` (cần `pg_dump`, gói PostgreSQL dev không kèm).
- Chấm công GPS trên thiết bị thật; quét QR bằng camera điện thoại thật (đã kiểm thử luồng token qua API).
- Hiệu năng với > 1.000 nhân viên (thiết kế phù hợp SME; bảng công phân trang 25 người/trang).
