# HRM – Hệ thống quản lý nhân sự

Ứng dụng web quản lý toàn bộ vòng đời nhân viên cho doanh nghiệp vừa và nhỏ tại Việt Nam: hồ sơ, tổ chức, chấm công & ca làm, nghỉ phép, phê duyệt nhiều cấp, tiền lương, KPI, tuyển dụng, tiếp nhận/nghỉ việc, tài sản, báo cáo, HR Insights và quản trị hệ thống. Giao diện tiếng Việt, định dạng ngày `dd/MM/yyyy`, tiền tệ VND, múi giờ `Asia/Ho_Chi_Minh`.

**Công nghệ:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Recharts · PostgreSQL · Prisma 6 · Zod · Vitest · Docker.

## Chạy thử nhanh trên máy phát triển (Windows/macOS/Linux)

Yêu cầu: Node.js ≥ 20 (đã thử với Node 26), npm.

```bash
npm install
node scripts/setup-env.mjs          # tạo .env với khoá bí mật ngẫu nhiên
npm run db:start                    # cửa sổ 1: PostgreSQL thật chạy cục bộ (gói embedded-postgres, cổng 5433)
npx prisma migrate deploy           # cửa sổ 2: tạo bảng
npm run db:seed:demo                # dữ liệu DEMO (24 nhân viên, chấm công, đơn từ…) – chỉ dùng thử nghiệm
npm run dev                         # http://localhost:3000
```

Tài khoản demo và mật khẩu (sinh ngẫu nhiên) nằm trong `.devdb/demo-accounts.txt`.

Cài đặt **không có dữ liệu giả** (dùng thật): thay `db:seed:demo` bằng
`npm run db:seed && npm run create-admin -- --email quantri@congty.vn`.

## Kiểm thử

```bash
npm test               # 87 kiểm thử đơn vị (tính công, ca qua đêm, phép, lương, phân quyền, bảo mật)
npm run test:smoke     # 134 kiểm thử end-to-end qua HTTP (cần server đang chạy + dữ liệu demo)
npm run typecheck
```

## Tài liệu

| Phần | Tài liệu |
|---|---|
| A. Tổng quan, phạm vi, giả định | [docs/01-TONG-QUAN.md](docs/01-TONG-QUAN.md) |
| B. Kiến trúc, cấu trúc thư mục, mô hình dữ liệu, ma trận phân quyền | [docs/02-KIEN-TRUC.md](docs/02-KIEN-TRUC.md) |
| C. Thiết kế UI/UX, sitemap | [docs/03-UI-UX.md](docs/03-UI-UX.md) |
| D. Nghiệp vụ chính, API, xác thực & bảo mật | [docs/04-NGHIEP-VU-BAO-MAT.md](docs/04-NGHIEP-VU-BAO-MAT.md) |
| E. Kiểm thử & kết quả | [docs/05-KIEM-THU.md](docs/05-KIEM-THU.md) |
| F. Triển khai, Docker, sao lưu/khôi phục | [docs/06-TRIEN-KHAI.md](docs/06-TRIEN-KHAI.md) |
| G. Bàn giao: hướng dẫn sử dụng, chức năng chưa hoàn thành, rủi ro | [docs/07-BAN-GIAO.md](docs/07-BAN-GIAO.md) |

Tài liệu API (OpenAPI 3.1): `GET /api/openapi` (cần đăng nhập).
