#!/usr/bin/env bash
# Kiểm tra khả năng khôi phục: khôi phục bản dump vào database tạm, đếm bản ghi chính, rồi xoá database tạm.
# Dùng: scripts/restore-test.sh backups/hrm-db-20261117-0130.dump
set -euo pipefail
cd "$(dirname "$0")/.."
FILE="${1:?Cần đường dẫn file .dump}"
set -a; [ -f .env ] && . ./.env; set +a
U="${POSTGRES_USER:-hrm}"
TMPDB="hrm_restore_test_$(date +%s)"

docker compose exec -T db createdb -U "$U" "$TMPDB"
trap 'docker compose exec -T db dropdb -U "$U" --if-exists "$TMPDB" >/dev/null' EXIT
docker compose exec -T db pg_restore -U "$U" -d "$TMPDB" --no-owner < "$FILE"
docker compose exec -T db psql -U "$U" -d "$TMPDB" -At -c \
  "select 'employees', count(*) from employees union all select 'attendance_records', count(*) from attendance_records union all select 'payroll_records', count(*) from payroll_records union all select 'audit_logs', count(*) from audit_logs;"
echo "KHÔI PHỤC THÀNH CÔNG – ghi nhận kết quả vào biên bản kiểm tra sao lưu."
