// Kiểm thử end-to-end qua HTTP với server đang chạy (mặc định http://localhost:3000) và dữ liệu demo.
// Đọc tài khoản demo từ .devdb/demo-accounts.txt. Chạy: npm run test:smoke
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const accountsText = readFileSync(".devdb/demo-accounts.txt", "utf8");
const adminPw = accountsText.match(/admin@example\.com\s+mật khẩu: (\S+)/)[1];
const demoPw = accountsText.match(/tài khoản nhân viên demo: (\S+)/)[1];
const emailOf = (role, nth = 0) => [...accountsText.matchAll(new RegExp(`^${role}\\s+(\\S+)`, "gm"))][nth][1];

class Client {
  constructor(name) {
    this.name = name;
    this.cookie = "";
  }
  async req(method, path, body, extraHeaders = {}) {
    const headers = { cookie: this.cookie, ...extraHeaders };
    if (method !== "GET") headers.origin = BASE;
    if (body !== undefined && !(body instanceof FormData)) headers["content-type"] = "application/json";
    const res = await fetch(BASE + path, { method, headers, body: body instanceof FormData ? body : body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) if (c.startsWith("hrm_session=")) this.cookie = c.split(";")[0];
    const type = res.headers.get("content-type") ?? "";
    const data = type.includes("json") ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  }
  get(p) {
    return this.req("GET", p);
  }
  post(p, b, h) {
    return this.req("POST", p, b ?? {}, h);
  }
  patch(p, b) {
    return this.req("PATCH", p, b);
  }
  async login(email, password) {
    const r = await this.post("/api/auth/login", { email, password });
    if (r.status !== 200) throw new Error(`Đăng nhập ${email} thất bại: ${r.status} ${JSON.stringify(r.data)}`);
    return r;
  }
}

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log("  ✔", name);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.log("  ✘", name, "\n     →", e.message);
  }
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}
function expectStatus(r, code, ctx = "") {
  if (r.status !== code) throw new Error(`${ctx} mong đợi HTTP ${code}, nhận ${r.status}: ${typeof r.data === "string" ? r.data.slice(0, 160) : JSON.stringify(r.data).slice(0, 300)}`);
}

/**
 * Trang bị chặn quyền: 307 → /forbidden, hoặc (khi trang nằm trong vùng Suspense/streaming) HTTP 200 kèm
 * chỉ thị chuyển hướng của Next.js tới /forbidden. Trong mọi trường hợp HTML không được chứa dữ liệu nhạy cảm.
 */
function expectForbiddenPage(r, leakMarkers = []) {
  if (r.status === 307 || r.status === 302) {
    if (!String(r.headers.get("location")).includes("/forbidden")) throw new Error(`chuyển hướng sai: ${r.headers.get("location")}`);
    return;
  }
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const html = String(r.data);
  if (!/__next-page-redirect[^>]*url=\/forbidden/.test(html)) throw new Error("không có chỉ thị chuyển hướng tới /forbidden");
  const leaked = leakMarkers.filter((m) => html.includes(m));
  if (leaked.length) throw new Error("lộ dữ liệu: " + leaked.join(", "));
}

export { Client, test, expect, expectStatus, expectForbiddenPage, adminPw, demoPw, emailOf, BASE, results };

