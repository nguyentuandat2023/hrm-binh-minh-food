// Khởi động trên Railway (và nền tảng tương tự):
//   1. Kiểm tra cấu hình, tự tìm chuỗi kết nối DB từ các biến Railway khác nếu DATABASE_URL trống
//   2. Chờ cơ sở dữ liệu sẵn sàng (mặc định tối đa 90 giây)
//   3. prisma migrate deploy → dữ liệu nền (prisma/seed.ts) → kiểm tra đã có Super Admin
//   4. Chạy ứng dụng
// Nếu cấu hình sai: KHÔNG thoát (tránh vòng lặp khởi động lại khó hiểu) mà mở trang hướng dẫn tiếng Việt
// trên cổng PORT. Trang và nhật ký chỉ nêu TÊN biến, không bao giờ in giá trị bí mật.
import { spawn, spawnSync } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { resolve } from "node:path";

const PORT = Number(process.env.PORT) || 3000;
const DB_WAIT_SECONDS = Number(process.env.DB_WAIT_SECONDS) || 90;
const SERVICE = "hrm-binh-minh-food";
const log = (m) => console.log(`[khởi động] ${m}`);

// ---------- 1. Cấu hình ----------
function validPgUrl(v) {
  if (!v || v.includes("${{")) return false;
  try {
    const u = new URL(v);
    return (u.protocol === "postgresql:" || u.protocol === "postgres:") && !!u.hostname;
  } catch {
    return false;
  }
}

function resolveDatabaseUrl() {
  for (const key of ["DATABASE_URL", "DATABASE_PRIVATE_URL", "DATABASE_PUBLIC_URL", "POSTGRES_URL"]) {
    if (validPgUrl(process.env[key])) return { url: process.env[key], source: key };
  }
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGUSER && PGPASSWORD) {
    const u = new URL("postgresql://localhost");
    u.hostname = PGHOST;
    u.port = PGPORT || "5432";
    u.username = PGUSER;
    u.password = PGPASSWORD;
    u.pathname = "/" + (PGDATABASE || PGUSER);
    return { url: u.toString(), source: "PGHOST/PGUSER/PGPASSWORD" };
  }
  return null;
}

const problems = [];
const warnings = [];
const PASTE_HINT = `Mở file .env.railway bằng Notepad, chọn tất cả, rồi dán vào Railway → ô <b>${SERVICE}</b> → tab <b>Variables</b> → <b>Raw Editor</b> → <b>Update Variables</b> (dán vào ô ứng dụng, không phải ô Postgres).`;

const db = resolveDatabaseUrl();
if (!db) {
  const raw = process.env.DATABASE_URL;
  problems.push({
    title: raw ? "DATABASE_URL không phải chuỗi kết nối PostgreSQL hợp lệ" : "Thiếu kết nối cơ sở dữ liệu (DATABASE_URL trống)",
    hint:
      "Dự án Railway cần một ô PostgreSQL (+ Create → Database → PostgreSQL). Trong tab Variables của ô " +
      `<b>${SERVICE}</b> phải có dòng <code>DATABASE_URL="\${{Postgres.DATABASE_URL}}"</code>. Nếu ô cơ sở dữ liệu ` +
      "có tên khác <b>Postgres</b> (ví dụ Postgres-AbCd), sửa chữ trong <code>\${{ }}</code> cho đúng tên ô đó. " + PASTE_HINT,
  });
} else {
  process.env.DATABASE_URL = db.url;
  if (db.source !== "DATABASE_URL") log(`DATABASE_URL trống – dùng chuỗi kết nối từ ${db.source}`);
}

const key = process.env.DATA_ENCRYPTION_KEY;
if (!key || Buffer.from(key, "base64").length !== 32) {
  problems.push({ title: key ? "DATA_ENCRYPTION_KEY không hợp lệ (phải là 32 byte dạng base64)" : "Thiếu DATA_ENCRYPTION_KEY", hint: PASTE_HINT });
}
if (!process.env.QR_SECRET || process.env.QR_SECRET.length < 16) {
  problems.push({ title: "Thiếu QR_SECRET (tối thiểu 16 ký tự)", hint: PASTE_HINT });
}
if (!process.env.CRON_SECRET) warnings.push("Thiếu CRON_SECRET – chỉ ảnh hưởng khi gọi /api/cron/daily từ bên ngoài.");
try {
  if (!process.env.APP_URL || !new URL(process.env.APP_URL).host) throw new Error();
} catch {
  warnings.push("APP_URL chưa có tên miền – vào Settings → Networking → Generate Domain (cổng 3000).");
}

// ---------- Trang hướng dẫn khi cấu hình sai ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function setupMode(items) {
  console.error("[khởi động] ✗ CHƯA THỂ CHẠY HỆ THỐNG – cấu hình chưa đúng:");
  for (const p of items) console.error(`[khởi động]   • ${p.title}`);
  for (const w of warnings) console.error(`[khởi động]   (lưu ý) ${w}`);
  console.error(`[khởi động] Đang mở trang hướng dẫn trên cổng ${PORT}. Sửa xong biến trong Railway, hệ thống tự triển khai lại.`);
  // Phần "hint" là văn bản cố định trong file này (có thẻ <b>/<code>); phần "title"/"detail" luôn được escape.
  const list = items
    .map((p) => `<li><strong>${esc(p.title)}</strong>${p.detail ? `<div class="d">${esc(p.detail)}</div>` : ""}<div class="h">${p.hint}</div></li>`)
    .join("");
  const warn = warnings.length ? `<h2>Lưu ý thêm</h2><ul class="w">${warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : "";
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Cần hoàn tất cấu hình</title><style>
:root{--bg:#fbf8f3;--card:#fff;--t:#24130f;--m:#6b5a54;--b:#eadfd3;--r:#a3000f;--g:#fbf0db}
@media(prefers-color-scheme:dark){:root{--bg:#140c0b;--card:#1f1513;--t:#f4ebe6;--m:#b9a69f;--b:#3a2a26;--r:#f0646e;--g:#33240e}}
body{margin:0;background:var(--bg);color:var(--t);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 16px}h1{font-size:26px;margin:0 0 6px}p{color:var(--m)}
ol{padding:0;list-style:none;counter-reset:n}ol>li{counter-increment:n;background:var(--card);border:1px solid var(--b);border-radius:12px;padding:16px 18px 16px 52px;margin:12px 0;position:relative}
ol>li::before{content:counter(n);position:absolute;left:16px;top:16px;width:24px;height:24px;border-radius:50%;background:var(--r);color:#fff;font-weight:700;font-size:13px;display:grid;place-items:center}
.h,.d{color:var(--m);font-size:15px;margin-top:6px}.d{font-family:ui-monospace,Consolas,monospace;font-size:13.5px}
code{background:var(--g);padding:1px 6px;border-radius:5px;font-size:13.5px;word-break:break-all}h2{font-size:18px;margin-top:28px}.w{color:var(--m)}
</style></head><body><main><h1>Hệ thống nhân sự chưa thể khởi động</h1>
<p>Máy chủ đã chạy nhưng cấu hình trên Railway chưa đúng. Trang này chỉ nêu tên mục cần sửa, không hiển thị giá trị bí mật nào.
Sửa xong, Railway tự triển khai lại; tải lại trang sau khoảng 3–5 phút.</p><ol>${list}</ol>${warn}</main></body></html>`;
  const server = http.createServer((req, res) => {
    if ((req.url || "").startsWith("/api/health/live")) {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end('{"status":"setup_required"}');
      return;
    }
    res.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex", "x-frame-options": "DENY" });
    res.end(html);
  });
  server.listen(PORT);
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

// ---------- 2. Chờ cơ sở dữ liệu ----------
function tryConnect(host, port) {
  return new Promise((done) => {
    const s = net.connect({ host, port, timeout: 3000 });
    s.once("connect", () => { s.destroy(); done(null); });
    s.once("timeout", () => { s.destroy(); done("ETIMEDOUT"); });
    s.once("error", (e) => { s.destroy(); done(e.code || "ERROR"); });
  });
}

async function waitForDatabase(url) {
  const u = new URL(url);
  const port = Number(u.port) || 5432;
  const until = Date.now() + DB_WAIT_SECONDS * 1000;
  let last = null;
  for (let attempt = 1; Date.now() < until; attempt++) {
    last = await tryConnect(u.hostname, port);
    if (!last) {
      log(`Đã kết nối được cơ sở dữ liệu (lần thử ${attempt}).`);
      return null;
    }
    if (attempt === 1 || attempt % 5 === 0) log(`Chưa kết nối được cơ sở dữ liệu (${last}) – thử lại…`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  return last;
}

const DB_ERROR_HINT = {
  ENOTFOUND: "Không tìm thấy máy chủ cơ sở dữ liệu theo tên trong DATABASE_URL – kiểm tra ô Postgres có cùng dự án/môi trường và đúng tên trong ${{ }}.",
  EAI_AGAIN: "Không phân giải được tên máy chủ cơ sở dữ liệu – kiểm tra ô Postgres đang chạy (màu xanh).",
  ECONNREFUSED: "Máy chủ cơ sở dữ liệu từ chối kết nối – ô Postgres có thể đang khởi động lại hoặc bị lỗi.",
  ETIMEDOUT: "Hết thời gian chờ kết nối – kiểm tra ô Postgres đang chạy (màu xanh).",
};

// ---------- 3. Migrate, dữ liệu nền, Super Admin ----------
const run = (label, args, capture = false) => {
  log(`${label}…`);
  const r = spawnSync(process.execPath, args, { stdio: capture ? ["ignore", "inherit", "pipe"] : "inherit", env: process.env, encoding: "utf8" });
  if (capture && r.stderr) process.stderr.write(r.stderr);
  return r;
};

async function countSuperAdmins() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const role = await prisma.role.findUnique({ where: { key: "SUPER_ADMIN" } });
    if (!role) return 0;
    return await prisma.user.count({ where: { isActive: true, roles: { some: { roleId: role.id } } } });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  if (problems.length) return setupMode(problems);
  for (const w of warnings) log(`(lưu ý) ${w}`);

  const dbErr = await waitForDatabase(process.env.DATABASE_URL);
  if (dbErr) {
    return setupMode([{
      title: `Không kết nối được cơ sở dữ liệu sau ${DB_WAIT_SECONDS} giây`,
      detail: `Mã lỗi: ${dbErr}`,
      hint: esc(DB_ERROR_HINT[dbErr] ?? "Kiểm tra ô Postgres đang chạy và biến DATABASE_URL của ô ứng dụng."),
    }]);
  }

  const mig = run("Cập nhật cấu trúc cơ sở dữ liệu (prisma migrate deploy)", [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"]);
  if (mig.status !== 0) {
    return setupMode([{
      title: "Không cập nhật được cấu trúc cơ sở dữ liệu",
      hint: "Xem chi tiết trong Railway → Deployments → Deploy Logs (dòng bắt đầu bằng Error / P1000 / P3xxx). Thường do sai tài khoản/mật khẩu trong DATABASE_URL.",
    }]);
  }

  const seed = run("Tạo dữ liệu nền và tài khoản quản trị đầu tiên", [resolve("node_modules/tsx/dist/cli.mjs"), "prisma/seed.ts"], true);
  if (seed.status !== 0) {
    const msg = (seed.stderr || "").trim().split(/\r?\n/).pop() || "";
    return setupMode([{
      title: "Không tạo được dữ liệu nền / tài khoản quản trị",
      detail: msg.startsWith("INITIAL_") ? msg : "",
      hint: "Kiểm tra INITIAL_ADMIN_EMAIL và INITIAL_ADMIN_PASSWORD (tối thiểu 10 ký tự, có chữ hoa, chữ thường, chữ số). Chi tiết trong Deploy Logs.",
    }]);
  }

  if ((await countSuperAdmins()) === 0) {
    return setupMode([{
      title: "Chưa có tài khoản quản trị nào",
      hint: `Thêm hai biến <code>INITIAL_ADMIN_EMAIL</code> và <code>INITIAL_ADMIN_PASSWORD</code> vào tab Variables của ô <b>${SERVICE}</b> (có sẵn trong file .env.railway). Sau khi đăng nhập được, xoá INITIAL_ADMIN_PASSWORD.`,
    }]);
  }

  // ---------- 4. Chạy ứng dụng ----------
  log("Khởi động ứng dụng…");
  const app = spawn(process.execPath, [resolve(".next/standalone/server.js")], { stdio: "inherit", env: process.env });
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => app.kill(sig));
  app.on("exit", (code, signal) => {
    log(`Ứng dụng đã dừng (code ${code ?? "-"}, signal ${signal ?? "-"}).`);
    process.exit(code ?? 1);
  });
}

main().catch((e) => {
  console.error("[khởi động] Lỗi không mong đợi:", e instanceof Error ? e.message : e);
  setupMode([{ title: "Lỗi không mong đợi khi khởi động", hint: "Xem chi tiết trong Railway → Deployments → Deploy Logs." }]);
});
