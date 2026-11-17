#!/usr/bin/env bash
# Cài HRM lên máy chủ Ubuntu 22.04/24.04 mới (chạy bằng root, trong thư mục mã nguồn đã tải lên):
#   sudo bash scripts/server-setup.sh hrm.congty.vn
# Việc script làm: cài Docker, bật tường lửa (22/80/443), tạo swap nếu RAM ít, sinh .env với bí mật ngẫu nhiên
# (giữ nguyên nếu đã có), build & chạy (PostgreSQL + migration + app + Caddy HTTPS), đặt lịch sao lưu hằng ngày.
set -euo pipefail
DOMAIN="${1:?Cách dùng: sudo bash scripts/server-setup.sh <tên-miền>}"
cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"

echo "==> 1/6 Cài Docker"
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl openssl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "==> 2/6 Tường lửa"
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw --force enable >/dev/null
fi

echo "==> 3/6 Bộ nhớ swap (build Next.js cần RAM)"
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$MEM_MB" -lt 3500 ] && ! swapon --show | grep -q .; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> 4/6 Biến môi trường (.env)"
if [ ! -f .env ]; then
  cat > .env <<EOF
POSTGRES_USER=hrm
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_DB=hrm
DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -hex 32)
QR_SECRET=$(openssl rand -hex 32)
DOMAIN=$DOMAIN
APP_URL=https://$DOMAIN
COOKIE_SECURE=true
SESSION_TTL_HOURS=12
ENABLE_INTERNAL_SCHEDULER=true
EOF
  chmod 600 .env
  echo "    Đã tạo .env mới. SAO LƯU DATA_ENCRYPTION_KEY ra nơi an toàn!"
else
  echo "    Giữ nguyên .env đã có"
fi

echo "==> 5/6 Build và khởi động (lần đầu mất 5–15 phút)"
docker compose up -d --build

echo "==> 6/6 Lịch sao lưu hằng ngày 01:30"
chmod +x scripts/*.sh
( crontab -l 2>/dev/null | grep -v 'hrm-backup' ; echo "30 1 * * * cd $APP_DIR && ./scripts/backup.sh >> /var/log/hrm-backup.log 2>&1 # hrm-backup" ) | crontab -

echo
echo "Xong. Kiểm tra: docker compose ps   |   curl -I https://$DOMAIN/login"
echo "Tạo tài khoản quản trị: ADMIN_PASSWORD='...' docker compose run --rm -e ADMIN_PASSWORD migrate npx tsx scripts/create-admin.ts --email <email>"
