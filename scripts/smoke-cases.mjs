import { Client, test, expect, expectStatus, adminPw, demoPw, emailOf } from "./smoke-lib.mjs";

export async function runAll() {
  const anon = new Client("anon");
  const admin = new Client("admin");
  console.log("\n[Xác thực]");
  await test("Chưa đăng nhập: trang chủ chuyển hướng về /login", async () => {
    const r = await anon.get("/");
    expect(r.status === 307 || r.status === 302, `status ${r.status}`);
    expect(String(r.headers.get("location")).includes("/login"), "không chuyển về /login");
  });
  await test("Chưa đăng nhập: API trả 401", async () => expectStatus(await anon.get("/api/employees"), 401));
  await test("Sai mật khẩu bị từ chối với thông báo chung", async () => {
    const r = await anon.post("/api/auth/login", { email: "admin@example.com", password: "sai-mat-khau" });
    expectStatus(r, 401);
    expect(r.data.error === "Email hoặc mật khẩu không đúng", "thông báo lỗi không chung chung");
  });
  await test("Chống CSRF: POST thiếu Origin bị chặn", async () => {
    const res = await fetch(new URL("/api/auth/login", "http://localhost:3000"), {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ email: "a@b.c", password: "x" }),
    });
    expect(res.status === 403, `status ${res.status}`);
  });
  await test("35 lần đăng nhập đúng liên tiếp không làm người khác bị chặn (không dùng chung hạn mức)", async () => {
    for (let i = 0; i < 35; i++) {
      const r = await new Client("burst").post("/api/auth/login", { email: "admin@example.com", password: adminPw });
      expectStatus(r, 200, `lần ${i + 1}`);
    }
  });
  await test("Super Admin đăng nhập & mở Dashboard", async () => {
    await admin.login("admin@example.com", adminPw);
    const r = await admin.get("/");
    expectStatus(r, 200, "GET /");
    expect(r.data.includes("Tổng quan nhân sự"), "không thấy tiêu đề Dashboard");
  });

  const pages = ["/", "/me", "/employees", "/departments", "/org-chart", "/attendance", "/shifts", "/leave", "/approvals", "/payroll", "/kpi", "/recruitment", "/lifecycle", "/assets", "/reports", "/insights", "/notifications", "/settings", "/settings/users", "/settings/roles", "/settings/company", "/settings/audit", "/settings/backup"];
  console.log("\n[Trang – Super Admin]");
  for (const p of pages) {
    await test(`GET ${p} → 200`, async () => expectStatus(await admin.get(p), 200, p));
  }

  const { runModuleCases } = await import("./smoke-modules.mjs");
  const shared = await runModuleCases({ admin, anon, Client, demoPw, emailOf });
  const { runPhase4 } = await import("./smoke-phase4.mjs");
  await runPhase4(shared);
}
