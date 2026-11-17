// Sao lưu khi chạy không dùng Docker: cần pg_dump (PostgreSQL client) trên PATH hoặc biến PG_DUMP_PATH.
// Lưu ý: gói embedded-postgres dùng cho môi trường dev KHÔNG kèm pg_dump.
import { spawn } from "node:child_process";
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, rmSync } from "node:fs";
import path from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");
const dir = path.resolve(process.env.BACKUP_DIR || "./backups");
const retention = Number(process.env.RETENTION_DAYS || 14);
mkdirSync(dir, { recursive: true });
const ts = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13).replace("T", "-");
const out = path.join(dir, `hrm-db-${ts}.dump`);
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete("schema");
const bin = process.env.PG_DUMP_PATH || "pg_dump";

const child = spawn(bin, ["--format=custom", "--no-owner", url.toString()], { stdio: ["ignore", "pipe", "inherit"] });
child.on("error", () => {
  console.error(`Không chạy được "${bin}". Cài PostgreSQL client hoặc đặt PG_DUMP_PATH. (embedded-postgres dev không có pg_dump)`);
  process.exit(1);
});
child.stdout.pipe(createWriteStream(out, { mode: 0o600 }));
child.on("close", (code) => {
  if (code !== 0) {
    console.error("pg_dump lỗi, mã", code);
    try {
      unlinkSync(out);
    } catch {}
    process.exit(1);
  }
  const storage = path.resolve(process.env.STORAGE_DIR || "./storage");
  if (existsSync(storage)) cpSync(storage, path.join(dir, `hrm-files-${ts}`), { recursive: true });
  const cutoff = Date.now() - retention * 86400_000;
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (n.startsWith("hrm-") && statSync(p).mtimeMs < cutoff) rmSync(p, { recursive: true, force: true });
  }
  console.log("Sao lưu xong:", out);
});
