// Kiểm thử giai đoạn 4: tiền lương (kỳ lương khoá, phân tách nhiệm vụ), KPI, tuyển dụng, tiếp nhận/nghỉ việc, tài sản, insights.
import { readFileSync } from "node:fs";
import { Client, test, expect, expectStatus, expectForbiddenPage } from "./smoke-lib.mjs";

const accounts = readFileSync(".devdb/demo-accounts.txt", "utf8");
const demoPw = accounts.match(/tài khoản nhân viên demo: (\S+)/)[1];
const emailByName = (name) => accounts.split("\n").find((l) => l.includes(`(${name})`)).trim().split(/\s+/)[1];
const todayKey = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export async function runPhase4({ admin, emp, mgr, hr, payroll, lan }) {
  const login = async (n) => {
    const c = new Client(n);
    await c.login(emailByName(n), demoPw);
    return c;
  };
  const director = await login("Nguyễn Văn An");
  const otherMgr = await login("Đinh Công Thành");
  const t = todayKey();
  const prevMonth = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);

  console.log("\n[Tiền lương]");
  await test("Nhân viên mở trang Tiền lương → /forbidden", async () => expectForbiddenPage(await emp.get("/payroll"), ["Thực lĩnh"]));
  let period = (await payroll.get("/api/payroll/periods")).data.items.find((p) => p.code === prevMonth);
  const fresh = !period || period.status !== "LOCKED";
  if (!period) {
    await test(`Kế toán tạo kỳ lương ${prevMonth}`, async () => {
      const r = await payroll.post("/api/payroll/periods", { month: prevMonth });
      expectStatus(r, 200);
      period = { id: r.data.id };
    });
  }
  await test("Tạo trùng kỳ lương → 409", async () => expectStatus(await payroll.post("/api/payroll/periods", { month: prevMonth }), 409));
  const cfgs = (await payroll.get("/api/payroll/configs")).data.items;
  const draft = cfgs.find((c) => c.status === "DRAFT");
  if (fresh && draft && !cfgs.some((c) => c.status === "ACTIVE")) {
    await test("Chưa kích hoạt cấu hình lương → không cho tính lương (không tự giả định thuế/BH)", async () => {
      const r = await payroll.post(`/api/payroll/periods/${period.id}`, { action: "calculate" });
      expectStatus(r, 400);
      expect(String(r.data.error).includes("xác minh"), r.data.error);
    });
    await test("Kích hoạt cấu hình cần ghi chú xác minh ≥ 20 ký tự", async () => expectStatus(await payroll.patch(`/api/payroll/configs/${draft.id}`, { action: "activate", verifiedNote: "ok" }), 400));
    await test("Kế toán xác minh & kích hoạt cấu hình (chạy thử công thức trước)", async () => {
      const r = await payroll.patch(`/api/payroll/configs/${draft.id}`, { action: "activate", verifiedNote: "DỮ LIỆU KIỂM THỬ – smoke test, không dùng cho Production" });
      expectStatus(r, 200);
      expect(r.data.probe.net > 0, "chạy thử không ra kết quả");
    });
  }
  if (fresh) {
    await test("Thêm khoản thưởng cho nhân viên trong kỳ", async () => expectStatus(await payroll.post(`/api/payroll/periods/${period.id}/adjustments`, { employeeId: lan.id, type: "BONUS", amount: 1000000, taxable: true, note: "Thưởng kiểm thử" }), 200));
    await test("Tính lương nháp", async () => {
      const r = await payroll.post(`/api/payroll/periods/${period.id}`, { action: "calculate" });
      expectStatus(r, 200);
      expect(r.data.count > 10, `chỉ tính ${r.data.count} người`);
    });
    await test("Kế toán (không có quyền duyệt) duyệt bảng lương → 403", async () => expectStatus(await payroll.post(`/api/payroll/periods/${period.id}`, { action: "approve" }), 403));
    await test("Khoá khi chưa duyệt → 409", async () => expectStatus(await director.post(`/api/payroll/periods/${period.id}`, { action: "lock" }), 409));
    await test("Ban giám đốc duyệt bảng lương", async () => expectStatus(await director.post(`/api/payroll/periods/${period.id}`, { action: "approve" }), 200));
    await test("Ban giám đốc khoá & phát hành phiếu lương", async () => {
      const r = await director.post(`/api/payroll/periods/${period.id}`, { action: "lock" });
      expectStatus(r, 200);
      expect(r.data.published > 10, "không phát hành phiếu lương");
    });
  }
  const workDay = (() => {
    for (let d = 10; d < 20; d++) {
      const k = `${prevMonth}-${String(d).padStart(2, "0")}`;
      const dow = new Date(k + "T00:00:00Z").getUTCDay();
      if (dow >= 1 && dow <= 5) return k;
    }
  })();
  await test("Kỳ lương đã khoá: không tính lại được (409)", async () => expectStatus(await payroll.post(`/api/payroll/periods/${period.id}`, { action: "calculate" }), 409));
  await test("Kỳ lương đã khoá: không thêm khoản điều chỉnh (409)", async () => expectStatus(await payroll.post(`/api/payroll/periods/${period.id}/adjustments`, { employeeId: lan.id, type: "BONUS", amount: 1000, taxable: true }), 409));
  await test("Kỳ lương đã khoá: HR không sửa được công trong kỳ (409)", async () => expectStatus(await hr.req("PUT", "/api/attendance/records", { employeeId: lan.id, workDate: workDay, checkIn: "08:00", checkOut: "17:00", note: "Sửa sau khoá" }), 409));
  await test("Kỳ lương đã khoá: nhân viên không gửi điều chỉnh công cho ngày trong kỳ (409)", async () => {
    const r = await emp.post("/api/attendance/requests", { kind: "ADJUSTMENT", workDate: workDay, checkIn: "08:00", reason: "Điều chỉnh sau khoá" });
    expect(r.status === 409 || r.status === 400, `status ${r.status}`);
  });
  let recordId;
  await test("Nhân viên nhận thông báo & xem được phiếu lương của mình", async () => {
    const n = (await emp.get("/api/notifications?size=50")).data.items.find((x) => x.type === "PAYSLIP");
    expect(n, "không có thông báo phiếu lương");
    recordId = n.link.split("/").pop();
    const r = await emp.get(n.link);
    expectStatus(r, 200);
    expect(r.data.includes("THỰC LĨNH") && r.data.includes("Ngô Thị Lan"), "phiếu lương không đúng");
  });
  await test("Nhân viên khác không xem được phiếu lương của đồng nghiệp", async () => {
    const other = await login("Hồ Ngọc Uyên");
    expectForbiddenPage(await other.get(`/payroll/payslip/${recordId}`), ["THỰC LĨNH", "Ngô Thị Lan"]);
  });
  await test("Xuất bảng lương Excel (kế toán)", async () => {
    const res = await fetch(`http://localhost:3000/api/payroll/periods/${period.id}/export`, { headers: { cookie: payroll.cookie } });
    expect(res.status === 200, `status ${res.status}`);
  });
  await test("Phân tách nhiệm vụ: người tính lương không tự duyệt", async () => {
    const m = new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 3, 1)).toISOString().slice(0, 7);
    let p = (await admin.get("/api/payroll/periods")).data.items.find((x) => x.code === m);
    if (!p) p = { id: (await admin.post("/api/payroll/periods", { month: m })).data.id };
    if (p.status === "LOCKED" || p.status === "APPROVED") return;
    expectStatus(await admin.post(`/api/payroll/periods/${p.id}`, { action: "calculate" }), 200, "admin tính");
    expectStatus(await admin.post(`/api/payroll/periods/${p.id}`, { action: "approve" }), 403, "admin tự duyệt");
  });

  console.log("\n[KPI]");
  const defs = await admin.get("/kpi?tab=definitions");
  void defs;
  const kpiPeriod = `${Number(t.slice(0, 4)) + 1}-0${1 + (Date.now() % 8)}`;
  let kpiDefId;
  await test("Trưởng phòng tạo chỉ tiêu KPI", async () => {
    const r = await mgr.post("/api/kpi/definitions", { code: `KT_${Date.now() % 100000}`, name: "Chỉ tiêu kiểm thử", category: "TASK", unit: "việc", direction: "HIGHER_BETTER" });
    expectStatus(r, 200);
    kpiDefId = r.data.id;
  });
  await test("Trưởng phòng khác giao KPI cho nhân viên phòng KD → 403", async () => expectStatus(await otherMgr.post("/api/kpi/assignments", { definitionId: kpiDefId, employeeIds: [lan.id], period: kpiPeriod, target: 10, weight: 1 }), 403));
  await test("Trưởng phòng KD giao KPI cho nhân viên phòng mình", async () => expectStatus(await mgr.post("/api/kpi/assignments", { definitionId: kpiDefId, employeeIds: [lan.id], period: kpiPeriod, target: 10, weight: 1 }), 200));
  await test("Nhân viên cập nhật kết quả KPI của mình", async () => {
    const page = await emp.get(`/me?tab=kpi&period=${kpiPeriod}`);
    const id = page.data.match(/\/api\/kpi\/assignments\/([a-z0-9]+)\/results/)?.[1];
    expect(id, "không thấy KPI trên cổng nhân viên");
    expectStatus(await emp.post(`/api/kpi/assignments/${id}/results`, { value: 8, note: "Kiểm thử" }), 200);
    expectStatus(await emp.patch(`/api/kpi/assignments/${id}`, { action: "review", managerNote: "tự đánh giá" }), 403, "nhân viên tự đánh giá");
    expectStatus(await mgr.patch(`/api/kpi/assignments/${id}`, { action: "review", managerScore: 80, managerNote: "Đạt 80%" }), 200, "trưởng phòng đánh giá");
    expectStatus(await emp.post(`/api/kpi/assignments/${id}/results`, { value: 9 }), 409, "cập nhật sau khi đánh giá");
  });

  console.log("\n[Tuyển dụng]");
  let jobId, candId, hiredId;
  await test("Trưởng phòng không tạo được vị trí tuyển dụng (403)", async () => expectStatus(await mgr.post("/api/recruitment/jobs", { title: "Thử", headcount: 1, status: "OPEN" }), 403));
  await test("HR tạo vị trí, thêm ứng viên kèm CV", async () => {
    const j = await hr.post("/api/recruitment/jobs", { title: "Vị trí kiểm thử", headcount: 1, status: "OPEN" });
    expectStatus(j, 200);
    jobId = j.data.id;
    const fd = new FormData();
    fd.set("jobId", jobId);
    fd.set("fullName", "Ứng Viên Kiểm Thử");
    fd.set("email", `uv${Date.now()}@example.com`);
    fd.set("cv", new Blob(["%PDF-1.4\n%cv\n"], { type: "application/pdf" }), "cv.pdf");
    const c = await hr.post("/api/recruitment/candidates", fd);
    expectStatus(c, 200);
    candId = c.data.id;
  });
  await test("Tiếp nhận khi chưa ở giai đoạn Đề nghị → 400", async () => expectStatus(await hr.post(`/api/recruitment/candidates/${candId}/hire`, { startDate: t }), 400));
  await test("Lên lịch phỏng vấn, chuyển Đề nghị, sinh thư mời theo mẫu", async () => {
    expectStatus(await hr.post(`/api/recruitment/candidates/${candId}/interviews`, { scheduledAt: `${t}T09:00`, location: "Phòng họp 1" }), 200);
    expectStatus(await hr.patch(`/api/recruitment/candidates/${candId}`, { stage: "OFFER", rating: 4 }), 200);
    const m = await hr.get(`/api/recruitment/candidates/${candId}?template=offer`);
    expectStatus(m, 200);
    expect(m.data.text.includes("Ứng Viên Kiểm Thử") && m.data.text.includes("Vị trí kiểm thử"), "mẫu không thay biến");
  });
  await test("Tiếp nhận ứng viên → tạo hồ sơ nhân viên thử việc + checklist tiếp nhận", async () => {
    const r = await hr.post(`/api/recruitment/candidates/${candId}/hire`, { startDate: t, probationDays: 60 });
    expectStatus(r, 200);
    hiredId = r.data.employeeId;
    const p = await hr.get("/lifecycle?type=ONBOARDING");
    expect(p.data.includes("Ứng Viên Kiểm Thử"), "không có checklist tiếp nhận");
  });
  await test("Tiếp nhận lần 2 → 409", async () => expectStatus(await hr.post(`/api/recruitment/candidates/${candId}/hire`, { startDate: t }), 409));

  console.log("\n[Tài sản & nghỉ việc]");
  let assetId, offId;
  await test("HR thêm tài sản và bàn giao cho nhân viên mới", async () => {
    const a = await hr.post("/api/assets", { name: "Laptop kiểm thử", category: "LAPTOP" });
    expectStatus(a, 200);
    assetId = a.data.id;
    expectStatus(await hr.post(`/api/assets/${assetId}`, { action: "assign", employeeId: hiredId, conditionOut: "Mới" }), 200);
  });
  await test("Bàn giao trùng tài sản đang sử dụng → 409", async () => expectStatus(await hr.post(`/api/assets/${assetId}`, { action: "assign", employeeId: lan.id }), 409));
  await test("Tạo checklist nghỉ việc; hoàn tất khi còn việc → 409", async () => {
    const r = await hr.post("/api/lifecycle", { type: "OFFBOARDING", employeeId: hiredId, targetDate: t, reason: "Kiểm thử nghỉ việc" });
    expectStatus(r, 200);
    offId = r.data.id;
    expectStatus(await hr.post(`/api/lifecycle/${offId}`, { action: "complete" }), 409);
  });
  await test("Hoàn tất các đầu việc nhưng còn giữ tài sản → 409", async () => {
    const page = (await hr.get(`/lifecycle/${offId}`)).data;
    const taskIds = [...new Set([...page.matchAll(/"taskId":"([a-z0-9]+)"/g)].map((m) => m[1]))];
    const raw = [...page.matchAll(/taskId\\?":\\?"([a-z0-9]+)/g)].map((m) => m[1]);
    const ids = taskIds.length ? taskIds : [...new Set(raw)];
    expect(ids.length >= 5, `chỉ thấy ${ids.length} đầu việc`);
    for (const id of ids) expectStatus(await hr.post(`/api/lifecycle/${offId}`, { action: "toggle_task", taskId: id, done: true }), 200);
    const r = await hr.post(`/api/lifecycle/${offId}`, { action: "complete" });
    expectStatus(r, 409);
    expect(String(r.data.error).includes("tài sản"), r.data.error);
  });
  await test("Thu hồi tài sản → hoàn tất nghỉ việc (HR chọn chuyển trạng thái, khoá tài khoản)", async () => {
    expectStatus(await hr.post(`/api/assets/${assetId}`, { action: "return", conditionIn: "Tốt", toStatus: "AVAILABLE" }), 200);
    expectStatus(await hr.post(`/api/lifecycle/${offId}`, { action: "complete", applyResignation: true, lockAccount: true }), 200);
    const e = await hr.get(`/api/employees/${hiredId}`);
    expect(e.data.work.status === "RESIGNED", `trạng thái ${e.data.work.status}`);
  });

  console.log("\n[HR Insights & trang giai đoạn 4]");
  await test("HR Insights hiển thị (HR)", async () => {
    const r = await hr.get("/insights");
    expectStatus(r, 200);
    expect(r.data.includes("Tóm tắt nhân sự tự động"), "thiếu tóm tắt");
  });
  await test("Nhân viên không xem được HR Insights", async () => expectForbiddenPage(await emp.get("/insights"), ["Tóm tắt nhân sự", "Bất thường"]));
  for (const p of ["/payroll", "/payroll/config", `/payroll/${period.id}`, "/kpi", "/kpi?tab=compare", "/kpi?tab=definitions", "/recruitment", `/recruitment/${jobId}`, "/lifecycle", "/assets", "/insights"]) {
    await test(`GET ${p} (admin) → 200`, async () => expectStatus(await admin.get(p), 200, p));
  }
  for (const p of ["/me?tab=overview", "/me?tab=schedule", "/me?tab=timesheet", "/me?tab=leave", "/me?tab=payslips", "/me?tab=kpi", "/me?tab=requests", "/me?tab=assets", "/org-chart", "/leave?tab=calendar"]) {
    await test(`GET ${p} (nhân viên) → 200`, async () => expectStatus(await emp.get(p), 200, p));
  }
  void director;
}
