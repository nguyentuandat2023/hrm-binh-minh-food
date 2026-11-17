// PostgreSQL cho môi trường phát triển/kiểm thử – dùng binary PostgreSQL thật (gói embedded-postgres),
// không cần cài đặt hệ thống hay Docker. Production dùng docker-compose (xem docs/TRIEN_KHAI.md).
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";

process.loadEnvFile?.(".env");
const url = new URL(process.env.DATABASE_URL ?? "");
if (!url.password) {
  console.error("DATABASE_URL thiếu mật khẩu. Chạy: node scripts/setup-env.mjs");
  process.exit(1);
}
const dataDir = path.resolve(".devdb/data");
const port = Number(url.port || 5433);
const dbName = url.pathname.replace(/^\//, "") || "hrm";

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port,
  persistent: true,
  authMethod: "scram-sha-256",
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: (e) => console.error(String(e)),
});

const firstRun = !existsSync(path.join(dataDir, "PG_VERSION"));
if (firstRun) {
  console.log("Khởi tạo cụm PostgreSQL tại", dataDir);
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase(dbName);
  console.log(`Đã tạo database "${dbName}"`);
} catch {
  // đã tồn tại
}
console.log(`PostgreSQL đang chạy tại localhost:${port} (database: ${dbName}). Nhấn Ctrl+C để dừng.`);

const shutdown = async () => {
  await pg.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
setInterval(() => {}, 1 << 30);
