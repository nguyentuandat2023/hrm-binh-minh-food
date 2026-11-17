# Phần F – Triển khai

## 1. Biến môi trường
| Biến | Bắt buộc | Mô tả |
|---|---|---|
| `DATABASE_URL` | ✔ | Chuỗi kết nối PostgreSQL (Compose tự ghép từ `POSTGRES_*`) |
| `DATA_ENCRYPTION_KEY` | ✔ | 32 byte base64 – khoá mã hoá CCCD/tài khoản/TOTP. **Sao lưu tách biệt với DB; mất khoá = mất dữ liệu mã hoá; không đổi khoá khi đã có dữ liệu** |
| `CRON_SECRET` | ✔ | Bí mật cho `POST /api/cron/daily` |
| `QR_SECRET` | ✔ | Bí mật ký mã QR chấm công |
| `APP_URL` | ✔ | URL công khai (kiểm tra Origin chống CSRF, link QR) |
| `COOKIE_SECURE` | ✔ prod | `true` khi chạy HTTPS |
| `SESSION_TTL_HOURS` | | Mặc định 12 |
| `STORAGE_DIR` / `BACKUP_DIR` | | Thư mục file đính kèm / sao lưu |
| `ENABLE_INTERNAL_SCHEDULER` | | `true` trên đúng 1 instance |

Mẫu: `.env.example` (dev), `.env.production.example` (Docker). Sinh khoá: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.

## 2. Môi trường phát triển (đã chạy thực tế trên Windows 10)
```bash
npm install                       # npm ≥ 11: các gói cần script cài đặt đã khai báo trong "allowScripts"
node scripts/setup-env.mjs
npm run db:start                  # PostgreSQL cục bộ (cửa sổ riêng)
npx prisma migrate deploy
npm run db:seed:demo              # hoặc: npm run db:seed && npm run create-admin -- --email ...
npm run dev
```

## 3. Production bằng Docker Compose (khuyến nghị)

### Cách nhanh: máy chủ Ubuntu mới + Caddy HTTPS tự động
1. Thuê VPS Ubuntu 24.04 (≥ 2 vCPU, 4 GB RAM, 40 GB SSD), gắn khoá SSH khi tạo.
2. Tạo bản ghi DNS loại **A**: `hrm.congty.vn` → IP của VPS.
3. Từ máy có mã nguồn:
   ```bash
   tar -czf hrm.tgz --exclude=node_modules --exclude=.next --exclude=.devdb --exclude=storage --exclude=backups --exclude=.env .
   scp hrm.tgz root@<IP>:/root/
   ssh root@<IP> "mkdir -p /opt/hrm && tar -xzf /root/hrm.tgz -C /opt/hrm && cd /opt/hrm && sed -i 's/\r$//' scripts/*.sh deploy/Caddyfile && bash scripts/server-setup.sh hrm.congty.vn"
   ```
4. Tạo tài khoản quản trị (mật khẩu truyền qua biến môi trường, không in ra):
   `ADMIN_PASSWORD='...' docker compose run --rm -e ADMIN_PASSWORD migrate npx tsx scripts/create-admin.ts --email quantri@congty.vn`

Dịch vụ `caddy` trong `docker-compose.yml` tự xin/gia hạn chứng chỉ Let's Encrypt cho `DOMAIN` (cần cổng 80/443 mở và DNS đã trỏ đúng) và ghi đè `X-Forwarded-For` bằng IP thật.

### Cách thủ công
Yêu cầu: máy chủ Linux có Docker 24+ và Docker Compose v2, tên miền, reverse proxy HTTPS.
```bash
git clone <repo> /opt/hrm && cd /opt/hrm
cp .env.production.example .env && nano .env        # điền toàn bộ giá trị CHANGE_ME
docker compose up -d --build                         # db → migrate (migrate deploy + seed nền) → app
docker compose run --rm migrate npx tsx scripts/create-admin.ts --email quantri@congty.vn
docker compose logs -f app
```
- Ứng dụng lắng nghe `127.0.0.1:3000`; DB không mở cổng ra ngoài.
- Image chạy bằng user `hrm` (không phải root), có `HEALTHCHECK` gọi `/api/health`.
- **Lưu ý:** Dockerfile/compose chưa được build thử trên máy phát triển (Docker daemon không chạy); bản build standalone tương đương đã được kiểm thử 134/134 ca.

### Reverse proxy HTTPS (ví dụ Nginx)
```nginx
server {
  listen 443 ssl http2;
  server_name hrm.congty.vn;
  ssl_certificate     /etc/letsencrypt/live/hrm.congty.vn/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/hrm.congty.vn/privkey.pem;
  client_max_body_size 12m;
  add_header Strict-Transport-Security "max-age=31536000" always;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```
Dùng `X-Forwarded-For $remote_addr` (ghi đè, không nối thêm) để IP trong nhật ký và giới hạn đăng nhập không bị giả mạo.

### Không dùng Docker
Node 20+ và PostgreSQL 15+: `npm ci && npx prisma migrate deploy && npm run db:seed && npm run build`, chép `.next/static` vào `.next/standalone/.next/static`, chạy `node --env-file=.env .next/standalone/server.js` bằng systemd/PM2 (đặt `STORAGE_DIR`, `BACKUP_DIR` là đường dẫn tuyệt đối vì server standalone đổi thư mục làm việc).

### Triển khai trên Railway (tự cập nhật từ GitHub)
Cấu hình sẵn: `railway.json` + `Dockerfile.railway`. Mỗi lần khởi động: `prisma migrate deploy` → `prisma/seed.ts` (dữ liệu nền; tạo Super Admin từ `INITIAL_ADMIN_EMAIL/PASSWORD` nếu chưa có) → chạy ứng dụng.
1. `node scripts/railway-env.mjs --email <email quản trị> --short "<tên viết tắt>"` → tạo `.env.railway` (không commit; sao lưu `DATA_ENCRYPTION_KEY`).
2. railway.com → đăng nhập bằng GitHub → **New Project → Deploy from GitHub repo** → chọn kho.
3. Trong project: **+ Create → Database → PostgreSQL** (tên dịch vụ để mặc định `Postgres`).
4. Dịch vụ ứng dụng → **Variables → Raw Editor** → dán nội dung `.env.railway` → Update.
5. Dịch vụ ứng dụng → **Settings → Volumes** (hoặc chuột phải → Attach volume) → mount path `/app/storage` (lưu file tải lên).
6. **Settings → Networking → Generate Domain** (cổng 3000) → mở link, đăng nhập.
7. Sau khi đăng nhập được: xoá biến `INITIAL_ADMIN_PASSWORD`, đổi mật khẩu nếu cần, bật xác thực hai lớp.
Lưu ý: chạy 1 bản (replica) duy nhất vì bộ lập lịch và giới hạn đăng nhập nằm trong bộ nhớ.

## 4. Danh sách kiểm tra trước khi bàn giao Production
1. `.env` đủ giá trị, `COOKIE_SECURE=true`, `APP_URL` đúng tên miền HTTPS.
2. Không chạy `db:seed:demo` (script tự từ chối khi `NODE_ENV=production`).
3. Tạo Super Admin bằng `create-admin`, đăng nhập, đổi mật khẩu, bật xác thực hai lớp.
4. *Cài đặt → Bảo mật*: bật **bắt buộc MFA cho tài khoản đặc quyền**.
5. *Cài đặt → Cấu hình doanh nghiệp*: tên, logo, ngày làm việc, ca mặc định, chính sách phép (rà soát pháp lý), ngày lễ năm hiện tại và năm sau.
6. *Tiền lương → Cấu hình lương*: kế toán đối chiếu văn bản hiện hành, ghi căn cứ, kích hoạt.
7. Tạo chi nhánh, phòng ban, chức vụ; nhập nhân viên bằng Excel; tạo tài khoản; gán trưởng phòng.
8. Cấu hình sao lưu tự động + chạy thử khôi phục (mục 5).
9. Kiểm tra `/api/health`, đăng nhập thử từng vai trò.

## 5. Sao lưu & khôi phục
- **Sao lưu hằng ngày** (cron trên máy chủ):
  ```cron
  30 1 * * * cd /opt/hrm && ./scripts/backup.sh >> /var/log/hrm-backup.log 2>&1
  ```
  Tạo `backups/hrm-db-<thời gian>.dump` (pg_dump định dạng custom) + `hrm-files-<thời gian>.tar.gz` (file đính kèm), kiểm tra bản dump bằng `pg_restore --list`, giữ 14 ngày.
- **Lưu trữ ngoài máy chủ:** đồng bộ thư mục `backups/` sang NAS/cloud có mã hoá; chỉ quản trị hệ thống truy cập; trang *Cài đặt → Sao lưu* cảnh báo khi không có bản sao lưu trong 36 giờ.
- **Kiểm tra khôi phục hằng tháng:** `./scripts/restore-test.sh backups/hrm-db-....dump` – khôi phục vào database tạm, đếm bản ghi, xoá database tạm.
- **Khôi phục thật:**
  ```bash
  docker compose stop app
  docker compose exec -T db dropdb -U hrm hrm && docker compose exec -T db createdb -U hrm hrm
  docker compose exec -T db pg_restore -U hrm -d hrm --no-owner < backups/hrm-db-XXXX.dump
  docker compose run --rm -T app tar -xzf - -C /app < backups/hrm-files-XXXX.tar.gz   # file đính kèm
  docker compose start app
  ```
  Cần đúng `DATA_ENCRYPTION_KEY` đã dùng khi sao lưu.

## 6. Tác vụ tự động
- Mặc định: bộ lập lịch nội bộ chạy 30 phút/lần (`ENABLE_INTERNAL_SCHEDULER=true`).
- Nhiều instance: đặt `false` và dùng cron ngoài:
  ```cron
  */30 * * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3000/api/cron/daily
  ```

## 7. Nâng cấp phiên bản
```bash
git pull && docker compose up -d --build        # migrate deploy chạy tự động
docker compose run --rm migrate npx tsx scripts/sync-permissions.ts            # xem quyền mới
docker compose run --rm migrate npx tsx scripts/sync-permissions.ts --apply    # thêm quyền mặc định còn thiếu
```
Luôn sao lưu trước khi nâng cấp. Không dùng `prisma migrate reset` trên Production.
