#!/usr/bin/env bash
# Sao lưu HRM khi chạy bằng Docker Compose. Đặt trong cron, ví dụ: 30 1 * * * /opt/hrm/scripts/backup.sh
# - pg_dump định dạng custom (nén) từ container "db"
# - nén thư mục file đính kèm (volume storage)
# - giữ RETENTION_DAYS ngày gần nhất
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TS="$(date +%Y%m%d-%H%M)"
mkdir -p "$BACKUP_DIR"
umask 077

# Biến POSTGRES_USER/POSTGRES_DB lấy từ file .env của docker compose
set -a; [ -f .env ] && . ./.env; set +a

docker compose exec -T db pg_dump -U "${POSTGRES_USER:-hrm}" -d "${POSTGRES_DB:-hrm}" --format=custom --no-owner > "$BACKUP_DIR/hrm-db-$TS.dump"
docker compose exec -T app tar -czf - -C /app storage > "$BACKUP_DIR/hrm-files-$TS.tar.gz"

# Kiểm tra nhanh tính toàn vẹn của bản dump
docker compose exec -T db pg_restore --list < "$BACKUP_DIR/hrm-db-$TS.dump" > /dev/null

find "$BACKUP_DIR" -name 'hrm-*' -mtime "+$RETENTION_DAYS" -delete
echo "Sao lưu xong: $BACKUP_DIR/hrm-db-$TS.dump"
