// Tạo file .env từ .env.example với các bí mật ngẫu nhiên. Không ghi đè .env đã có.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = ".env";
if (existsSync(target) && !process.argv.includes("--force")) {
  console.log(".env đã tồn tại – giữ nguyên. Dùng --force để tạo lại (sẽ mất khoá mã hoá cũ!).");
  process.exit(0);
}

const rand = (n) => randomBytes(n).toString("base64url");
let content = readFileSync(".env.example", "utf8");
const dbPassword = rand(18);
content = content
  .replace("postgresql://hrm:CHANGE_ME@", `postgresql://hrm:${dbPassword}@`)
  .replace('DATA_ENCRYPTION_KEY="CHANGE_ME_BASE64_32_BYTES"', `DATA_ENCRYPTION_KEY="${randomBytes(32).toString("base64")}"`)
  .replace('CRON_SECRET="CHANGE_ME"', `CRON_SECRET="${rand(32)}"`)
  .replace('QR_SECRET="CHANGE_ME"', `QR_SECRET="${rand(32)}"`);

writeFileSync(target, content, { encoding: "utf8", mode: 0o600 });
console.log("Đã tạo .env với bí mật ngẫu nhiên. Hãy sao lưu DATA_ENCRYPTION_KEY ở nơi an toàn.");
