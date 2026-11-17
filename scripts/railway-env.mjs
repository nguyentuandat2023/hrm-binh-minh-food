// Sinh file .env.railway (KHÔNG commit – đã nằm trong .gitignore) để dán vào Railway → Variables → Raw Editor.
//   node scripts/railway-env.mjs --email quantri@congty.vn --short "BÌNH MINH FOOD"
// Không ghi đè file đã có (mất DATA_ENCRYPTION_KEY = mất dữ liệu mã hoá).
import { randomBytes, randomInt } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const out = ".env.railway";
if (existsSync(out) && !process.argv.includes("--force")) {
  console.log(`${out} đã tồn tại – giữ nguyên.`);
  process.exit(0);
}
const email = arg("--email");
if (!email) {
  console.error("Dùng: node scripts/railway-env.mjs --email <email quản trị> [--short <tên viết tắt>] [--name <tên đầy đủ>]");
  process.exit(1);
}
// Mật khẩu mạnh ngẫu nhiên, đảm bảo có chữ hoa, chữ thường, số, ký tự đặc biệt
const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#%*-_"];
const all = sets.join("");
const chars = sets.map((s) => s[randomInt(s.length)]);
while (chars.length < 18) chars.push(all[randomInt(all.length)]);
for (let i = chars.length - 1; i > 0; i--) {
  const j = randomInt(i + 1);
  [chars[i], chars[j]] = [chars[j], chars[i]];
}
const lines = [
  "# Dán toàn bộ nội dung dưới đây vào Railway → service HRM → Variables → Raw Editor",
  'DATABASE_URL="${{Postgres.DATABASE_URL}}"',
  `DATA_ENCRYPTION_KEY="${randomBytes(32).toString("base64")}"`,
  `CRON_SECRET="${randomBytes(32).toString("hex")}"`,
  `QR_SECRET="${randomBytes(32).toString("hex")}"`,
  'APP_URL="https://${{RAILWAY_PUBLIC_DOMAIN}}"',
  'COOKIE_SECURE="true"',
  'SESSION_TTL_HOURS="12"',
  'ENABLE_INTERNAL_SCHEDULER="true"',
  'PORT="3000"',
  'STORAGE_DIR="/app/storage"',
  'TZ="Asia/Ho_Chi_Minh"',
  `INITIAL_ADMIN_EMAIL="${email}"`,
  `INITIAL_ADMIN_PASSWORD="${chars.join("")}"`,
  ...(arg("--short") ? [`INITIAL_COMPANY_SHORT_NAME="${arg("--short")}"`] : []),
  ...(arg("--name") ? [`INITIAL_COMPANY_NAME="${arg("--name")}"`] : []),
];
writeFileSync(out, lines.join("\n") + "\n", { encoding: "utf8", mode: 0o600 });
console.log(`Đã tạo ${out}. Sao lưu DATA_ENCRYPTION_KEY ở nơi an toàn; xoá INITIAL_ADMIN_PASSWORD trên Railway sau khi đăng nhập được.`);
