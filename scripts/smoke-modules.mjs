// Kiểm thử nghiệp vụ & phân quyền qua HTTP (dữ liệu demo). Mỗi case độc lập, in rõ lỗi.
import { readFileSync } from "node:fs";
import { Client, test, expect, expectStatus, expectForbiddenPage } from "./smoke-lib.mjs";

const accounts = readFileSync(".devdb/demo-accounts.txt", "utf8");
const demoPw = accounts.match(/tài khoản nhân viên demo: (\S+)/)[1];
const emailByName = (name) => {
  const line = accounts.split("\n").find((l) => l.includes(`(${name})`));
  if (!line) throw new Error("Không thấy tài khoản demo của " + name);
  return line.trim().split(/\s+/)[1];
};

function addDaysKey(n) {
  const d = new Date(Date.now() + 7 * 3600_000);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function nextWeekday(fromOffset) {
  for (let i = fromOffset; i < fromOffset + 14; i++) {
    const k = addDaysKey(i);
    const dow = new Date(k + "T00:00:00Z").getUTCDay();
    if (dow === 1) return k; // thứ Hai
  }
}

export async function runModuleCases({ admin }) {
  const login = async (name) => {
    const c = new Client(name);
    await c.login(emailByName(name), demoPw);
    return c;
  };
  const findEmp = async (q) => {
    const r = await admin.get(`/api/employees?q=${encodeURIComponent(q)}&inactive=1`);
    expectStatus(r, 200, "tìm nhân viên");
    const e = r.data.items.find((x) => x.fullName === q) ?? r.data.items[0];
    if (!e) throw new Error("Không thấy nhân viên " + q);
    return e;
  };

  console.log("\n[Phân quyền & phạm vi dữ liệu]");
  const emp = await login("Ngô Thị Lan"); // Nhân viên phòng KD
  const mgr = await login("Đặng Quốc Huy"); // Trưởng phòng KD
  const hr = await login("Lê Thu Hà"); // HR Admin
  const payroll = await login("Vũ Thị Hoa"); // Kế toán lương
  const otherMgr = await login("Đinh Công Thành"); // Trưởng phòng Kỹ thuật
  const lan = await findEmp("Ngô Thị Lan");
  const uyen = await findEmp("Hồ Ngọc Uyên"); // phòng Kỹ thuật

  await test("Tìm kiếm không dấu: 'ngo thi lan' ra Ngô Thị Lan", async () => {
    const r = await admin.get("/api/employees?q=ngo%20thi%20lan");
    expect(r.data.items.some((x) => x.fullName === "Ngô Thị Lan"), "không tìm thấy");
  });
  await test("Nhân viên: danh sách nhân viên chỉ có chính mình", async () => {
    const r = await emp.get("/api/employees");
    expectStatus(r, 200);
    expect(r.data.total === 1 && r.data.items[0].fullName === "Ngô Thị Lan", `thấy ${r.data.total} hồ sơ`);
  });
  await test("Nhân viên: xem hồ sơ đồng nghiệp → 403", async () => expectStatus(await emp.get(`/api/employees/${uyen.id}`), 403));
  await test("Nhân viên: mở trang Tiền lương → chuyển /forbidden, không lộ dữ liệu", async () => expectForbiddenPage(await emp.get("/payroll"), ["Thực lĩnh", "Tổng thu nhập"]));
  await test("Nhân viên: gọi API quản trị tài khoản → 403", async () => expectStatus(await emp.get("/api/admin/users"), 403));
  await test("Nhân viên: tự sửa phòng ban của mình → 403", async () => expectStatus(await emp.patch(`/api/employees/${lan.id}`, { departmentId: null }), 403));
  await test("Trưởng phòng KD: chỉ thấy nhân viên phòng mình", async () => {
    const r = await mgr.get("/api/employees?size=100");
    expectStatus(r, 200);
    expect(r.data.items.every((x) => x.department?.name === "Kinh doanh miền Bắc" || x.fullName === "Đặng Quốc Huy"), "thấy nhân viên phòng khác");
    expect(r.data.total >= 4, `chỉ thấy ${r.data.total}`);
  });
  await test("Trưởng phòng KD: xem hồ sơ phòng Kỹ thuật → 403", async () => expectStatus(await mgr.get(`/api/employees/${uyen.id}`), 403));
  await test("Trưởng phòng: không xem được lương / CCCD của nhân viên", async () => {
    const r = await mgr.get(`/api/employees/${lan.id}`);
    expectStatus(r, 200);
    expect(r.data.salary === null && r.data.private === null, "lộ dữ liệu nhạy cảm");
  });
  await test("Kế toán lương: xem được thông tin lương", async () => {
    const r = await payroll.get(`/api/employees/${lan.id}`);
    expectStatus(r, 200);
    expect(r.data.salary?.profile?.baseSalary > 0, "không thấy lương");
  });
  await test("HR không thao tác được trên tài khoản Super Admin (chống leo thang đặc quyền)", async () => {
    const users = (await hr.get("/api/admin/users")).data.items;
    const superUser = users.find((u) => u.roles.some((r) => r.role.key === "SUPER_ADMIN"));
    expect(superUser, "không thấy super admin");
    expectStatus(await hr.patch(`/api/admin/users/${superUser.id}`, { action: "reset_password" }), 403, "HR đặt lại mật khẩu Super Admin");
    expectStatus(await hr.patch(`/api/admin/users/${superUser.id}`, { action: "lock" }), 403, "HR khoá Super Admin");
  });
  await test("HR không tự gán vai trò cho chính mình", async () => {
    const users = (await hr.get("/api/admin/users")).data.items;
    const me = users.find((u) => u.email === emailByName("Lê Thu Hà"));
    const r = await hr.patch(`/api/admin/users/${me.id}`, { action: "set_roles", roleIds: me.roles.map((x) => x.roleId) });
    expectStatus(r, 403, "HR tự đổi vai trò");
  });
  await test("Xuất Excel danh sách nhân viên (HR) → file xlsx", async () => {
    const res = await fetch("http://localhost:3000/api/employees/export", { headers: { cookie: hr.cookie } });
    expect(res.status === 200 && (res.headers.get("content-type") ?? "").includes("spreadsheetml"), `status ${res.status}`);
  });

  console.log("\n[Hồ sơ nhân viên]");
  const nid = String(Date.now()).slice(-12);
  let newId;
  await test("HR tạo nhân viên mới (mã tự sinh, CCCD mã hoá)", async () => {
    const r = await hr.post("/api/employees", { fullName: "Nhân Viên Kiểm Thử", startDate: addDaysKey(0), status: "PROBATION", nationalId: nid, gender: "OTHER" });
    expectStatus(r, 200);
    expect(/^NV\d{4}$/.test(r.data.code), "mã không đúng định dạng");
    newId = r.data.id;
  });
  await test("Tạo trùng CCCD → 409", async () => expectStatus(await hr.post("/api/employees", { fullName: "Người Khác", startDate: addDaysKey(0), nationalId: nid }), 409));
  await test("Validate: thiếu ngày bắt đầu → 400 kèm lỗi trường", async () => {
    const r = await hr.post("/api/employees", { fullName: "A B" });
    expectStatus(r, 400);
    expect(r.data.fields?.startDate, "thiếu lỗi trường startDate");
  });
  await test("Sửa hồ sơ ghi lịch sử, không ghi giá trị CCCD vào nhật ký", async () => {
    const nid2 = "0" + String(Date.now()).slice(-11);
    expectStatus(await hr.patch(`/api/employees/${newId}`, { phone: "0912345678", nationalId: nid2 }), 200);
    const page = await hr.get(`/employees/${newId}?tab=history`);
    expect(page.data.includes("Cập nhật hồ sơ"), "không thấy lịch sử");
    expect(!page.data.includes(nid2), "CCCD bị ghi vào nhật ký");
  });
  await test("Upload tài liệu sai định dạng bị từ chối", async () => {
    const fd = new FormData();
    fd.set("file", new Blob(["MZ fake exe"], { type: "application/pdf" }), "virus.pdf");
    fd.set("category", "OTHER");
    expectStatus(await hr.post(`/api/employees/${newId}/documents`, fd), 400);
  });
  let docId;
  await test("Upload PDF hợp lệ → nhân viên phòng khác không tải được (403)", async () => {
    const fd = new FormData();
    fd.set("file", new Blob(["%PDF-1.4\n%test\n"], { type: "application/pdf" }), "hop-dong.pdf");
    fd.set("category", "CONTRACT");
    const r = await hr.post(`/api/employees/${uyen.id}/documents`, fd);
    expectStatus(r, 200);
    docId = r.data.id;
    expectStatus(await emp.get(`/api/files/${docId}`), 403, "nhân viên khác tải file");
    expectStatus(await hr.get(`/api/files/${docId}`), 200, "HR tải file");
  });
  await test("Nhập Excel: tải mẫu → kiểm tra phát hiện dòng lỗi → nhập dòng hợp lệ", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const res = await fetch("http://localhost:3000/api/employees/import", { headers: { cookie: hr.cookie } });
    expect(res.status === 200, `tải mẫu: ${res.status}`);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
    const ws = wb.worksheets[0];
    const stamp = String(Date.now()).slice(-8);
    ws.getRow(2).values = [`Nhập Excel ${stamp}`, `nhap${stamp}@example.com`, "0901234567", "KD", "NVKD", "HN", "", addDaysKey(1), "PROBATION", "1998-05-20", "FEMALE", "Hà Nội", "07" + stamp + "12"];
    ws.getRow(3).values = ["Dòng Lỗi", "khong-phai-email", "", "KHONG_TON_TAI", "", "", "", "sai-ngay", "", "", "", "", ""];
    const send = async (buf, commit) => {
      const fd = new FormData();
      fd.set("file", new Blob([buf]), "nhap.xlsx");
      fd.set("commit", commit ? "1" : "0");
      return hr.post("/api/employees/import", fd);
    };
    const check = await send(await wb.xlsx.writeBuffer(), false);
    expectStatus(check, 200, "kiểm tra");
    expect(check.data.errors.length === 1 && check.data.errors[0].row === 3, `lỗi: ${JSON.stringify(check.data.errors)}`);
    const blocked = await send(await wb.xlsx.writeBuffer(), true);
    expect(blocked.data.committed === false, "file có dòng lỗi vẫn được nhập");
    ws.spliceRows(3, 1);
    const ok = await send(await wb.xlsx.writeBuffer(), true);
    expectStatus(ok, 200, "nhập");
    expect(ok.data.committed === true && ok.data.valid === 1, JSON.stringify(ok.data));
    const found = await hr.get(`/api/employees?q=${encodeURIComponent(`Nhập Excel ${stamp}`)}`);
    expect(found.data.total === 1, "không tìm thấy nhân viên vừa nhập");
  });
  await test("Ngừng kích hoạt hồ sơ (giữ dữ liệu) và kích hoạt lại", async () => {
    expectStatus(await hr.post(`/api/employees/${newId}/status`, { active: false, reason: "Kiểm thử ngừng kích hoạt" }), 200);
    const r = await hr.get(`/api/employees/${newId}`);
    expect(r.data.work.deactivatedAt, "chưa ngừng kích hoạt");
    expectStatus(await hr.post(`/api/employees/${newId}/status`, { active: true, reason: "Kiểm thử kích hoạt lại" }), 200);
  });

  console.log("\n[Nghỉ phép – duyệt 2 cấp, số dư phép]");
  const start = nextWeekday(8);
  const end = addDaysKey(Math.round((new Date(start) - new Date(addDaysKey(0))) / 86400000) + 2); // T2 → T4 = 3 ngày
  const types = (await emp.get("/api/leave/types")).data.items;
  const annual = types.find((t) => t.code === "ANNUAL");
  let approvalId;
  let balanceBefore;
  await test("Xem trước số ngày nghỉ (T2→T4 = 3 ngày, trừ cuối tuần/lễ)", async () => {
    const r = await emp.get(`/api/leave/requests?start=${start}&end=${end}&halfDay=NONE&type=${annual.id}`);
    expectStatus(r, 200);
    expect(r.data.days === 3, `tính ra ${r.data.days} ngày`);
    balanceBefore = r.data.available;
  });
  await test("Nhân viên gửi đơn nghỉ 3 ngày → cần duyệt 2 cấp", async () => {
    const r = await emp.post("/api/leave/requests", { leaveTypeId: annual.id, startDate: start, endDate: end, reason: "Kiểm thử duyệt 2 cấp" });
    expectStatus(r, 200);
    const page = await mgr.get("/approvals");
    expect(page.data.includes("Kiểm thử duyệt 2 cấp") || page.data.includes("Ngô Thị Lan"), "không thấy trong hộp duyệt của trưởng phòng");
  });
  await test("Gửi trùng thời gian → 409", async () => expectStatus(await emp.post("/api/leave/requests", { leaveTypeId: annual.id, startDate: start, endDate: start, reason: "Trùng" }), 409));
  await test("Trưởng phòng khác (Kỹ thuật) không duyệt được đơn phòng KD", async () => {
    const page = await otherMgr.get("/approvals");
    expect(!page.data.includes("Kiểm thử duyệt 2 cấp"), "trưởng phòng khác thấy đơn");
  });
  await test("Trưởng phòng thấy đơn trong danh sách cần duyệt (API)", async () => {
    const mine = (await emp.get("/api/approvals?scope=mine")).data.items;
    const a = mine.find((x) => x.type === "LEAVE" && x.status === "PENDING" && x.requiredLevels === 2);
    expect(a, "không thấy đơn 2 cấp đang chờ");
    approvalId = a.id;
    const act = (await mgr.get("/api/approvals?scope=actionable")).data.items;
    expect(act.some((x) => x.id === approvalId), "trưởng phòng không có quyền duyệt cấp 1");
    const hrAct = (await hr.get("/api/approvals?scope=actionable")).data.items;
    expect(hrAct.some((x) => x.id === approvalId), "HR cũng được duyệt cấp 1 (phạm vi toàn công ty)");
  });
  await test("Nhân viên không tự duyệt đơn của mình → 403", async () => {
    expectStatus(await emp.post(`/api/approvals/${approvalId}`, { decision: "APPROVED" }), 403);
  });
  await test("Cấp 1: trưởng phòng duyệt → vẫn chờ cấp 2", async () => {
    expectStatus(await mgr.post(`/api/approvals/${approvalId}`, { decision: "APPROVED", comment: "Đồng ý" }), 200);
    const r = await emp.get(`/api/leave/requests?start=${start}&end=${end}&halfDay=NONE&type=${annual.id}`);
    expect(r.data.available === balanceBefore - 3, `số dư khả dụng ${r.data.available} (trước ${balanceBefore})`);
  });
  await test("Trưởng phòng không duyệt tiếp cấp 2 (cần người khác, quyền toàn công ty)", async () => {
    const r = await mgr.post(`/api/approvals/${approvalId}`, { decision: "APPROVED" });
    expect(r.status === 403 || r.status === 409, `status ${r.status}`);
  });
  await test("Từ chối phải có lý do", async () => expectStatus(await hr.post(`/api/approvals/${approvalId}`, { decision: "REJECTED" }), 400));
  await test("Cấp 2: HR duyệt → Đã duyệt, trừ 3 ngày phép", async () => {
    expectStatus(await hr.post(`/api/approvals/${approvalId}`, { decision: "APPROVED" }), 200);
    const r = await emp.get(`/api/leave/requests?start=${start}&end=${end}&halfDay=NONE&type=${annual.id}`);
    expect(r.data.available === balanceBefore - 3, `còn ${r.data.available}`);
  });
  await test("Duyệt lại yêu cầu đã xử lý → 409", async () => expectStatus(await hr.post(`/api/approvals/${approvalId}`, { decision: "APPROVED" }), 409));
  await test("Nhân viên huỷ đơn đã duyệt (chưa bắt đầu) → hoàn lại phép", async () => {
    expectStatus(await emp.post(`/api/approvals/${approvalId}`, { decision: "CANCEL" }), 200);
    const r = await emp.get(`/api/leave/requests?start=${start}&end=${end}&halfDay=NONE&type=${annual.id}`);
    expect(r.data.available === balanceBefore, `còn ${r.data.available}, mong đợi ${balanceBefore}`);
  });
  await test("Nghỉ nửa ngày = 0.5 ngày", async () => {
    const r = await emp.get(`/api/leave/requests?start=${start}&end=${start}&halfDay=MORNING&type=${annual.id}`);
    expect(r.data.days === 0.5, `tính ${r.data.days}`);
  });
  await test("Không đủ phép → 400", async () => {
    const r = await emp.post("/api/leave/requests", { leaveTypeId: annual.id, startDate: addDaysKey(40), endDate: addDaysKey(120), reason: "Nghỉ dài quá số phép" });
    expect(r.status === 400, `status ${r.status} ${JSON.stringify(r.data)}`);
  });

  console.log("\n[Chấm công]");
  await test("Nhân viên chấm công vào (WEB) → 200 hoặc 409 nếu đã chấm", async () => {
    const r = await emp.post("/api/attendance/punch", { type: "in", method: "WEB" });
    expect(r.status === 200 || r.status === 409, `status ${r.status} ${JSON.stringify(r.data)}`);
  });
  await test("QR sai/hết hạn bị từ chối", async () => expectStatus(await emp.post("/api/attendance/punch", { type: "in", method: "QR", qrToken: "123.all.fake" }), 400));
  await test("QR hợp lệ từ màn hình kiosk được chấp nhận", async () => {
    const t = await hr.get("/api/attendance/qr-token");
    expectStatus(t, 200);
    const token = decodeURIComponent(t.data.url.split("t=")[1]);
    const r = await emp.post("/api/attendance/punch", { type: "out", method: "QR", qrToken: token });
    // 409 "đã chấm công ra" = mã QR được chấp nhận nhưng quy tắc nghiệp vụ chặn chấm trùng (khi chạy lại test)
    expect(r.status === 200 || (r.status === 409 && String(r.data.error).includes("đã chấm công")), `status ${r.status} ${JSON.stringify(r.data)}`);
  });
  const adjDate = (() => {
    for (let i = 3; i < 15; i++) {
      const k = addDaysKey(-i);
      const dow = new Date(k + "T00:00:00Z").getUTCDay();
      if (dow >= 1 && dow <= 5) return k;
    }
  })();
  let adjId;
  await test("Gửi đề nghị điều chỉnh công → trưởng phòng duyệt → bảng công cập nhật", async () => {
    const r = await emp.post("/api/attendance/requests", { kind: "ADJUSTMENT", workDate: adjDate, checkIn: "08:00", checkOut: "17:00", reason: "Kiểm thử điều chỉnh công" });
    expectStatus(r, 200);
    adjId = r.data.id;
    expectStatus(await mgr.post(`/api/approvals/${adjId}`, { decision: "APPROVED" }), 200);
    const page = await emp.get(`/me?tab=timesheet&month=${adjDate.slice(0, 7)}`);
    expect(page.data.includes(adjDate.split("-").reverse().join("/")), "không thấy ngày trong bảng công");
  });
  await test("Điều chỉnh công ngày tương lai → 400", async () => expectStatus(await emp.post("/api/attendance/requests", { kind: "ADJUSTMENT", workDate: addDaysKey(3), checkIn: "08:00", reason: "Tương lai" }), 400));
  await test("Đăng ký tăng ca qua nửa đêm (22:00→01:00 = 3h)", async () => {
    // Dọn dữ liệu của lần chạy trước: huỷ đăng ký tăng ca đang chờ cho ngày kiểm thử
    const otDate = addDaysKey(5).split("-").reverse().join("/");
    for (const a of (await emp.get("/api/approvals?scope=mine")).data.items.filter((x) => x.type === "OVERTIME" && x.status === "PENDING" && x.title.includes(otDate))) {
      await emp.post(`/api/approvals/${a.id}`, { decision: "CANCEL" });
    }
    const r = await emp.post("/api/attendance/requests", { kind: "OVERTIME", workDate: addDaysKey(5), start: "22:00", end: "01:00", reason: "Kiểm thử tăng ca qua đêm" });
    expectStatus(r, 200);
    expectStatus(await emp.post("/api/attendance/requests", { kind: "OVERTIME", workDate: addDaysKey(5), start: "23:00", end: "23:30", reason: "Trùng giờ tăng ca" }), 409, "đăng ký trùng giờ");
    expectStatus(await emp.post(`/api/approvals/${r.data.id}`, { decision: "CANCEL" }), 200, "huỷ đăng ký");
  });
  await test("Nhân viên không sửa trực tiếp công của mình (API HR) → 403", async () => expectStatus(await emp.req("PUT", "/api/attendance/records", { employeeId: lan.id, workDate: adjDate, checkIn: "07:00", checkOut: "18:00", note: "tự sửa" }), 403));
  await test("Xuất bảng công Excel", async () => {
    const res = await fetch(`http://localhost:3000/api/attendance/export?month=${adjDate.slice(0, 7)}`, { headers: { cookie: hr.cookie } });
    expect(res.status === 200, `status ${res.status}`);
  });

  console.log("\n[Thông báo & tự động hoá]");
  await test("Chạy tác vụ tự động (idempotent – chạy 2 lần không tạo trùng)", async () => {
    const a = await admin.post("/api/admin/jobs", {});
    expectStatus(a, 200);
    const b = await admin.post("/api/admin/jobs", {});
    expectStatus(b, 200);
    expect(b.data.result.contracts === 0 && b.data.result.birthdays === 0, `lần 2 vẫn tạo thông báo: ${JSON.stringify(b.data.result)}`);
  });
  await test("HR nhận thông báo hợp đồng sắp hết hạn", async () => {
    // Thông báo chỉ tạo 1 lần (chống trùng) nên sau nhiều lượt chạy có thể nằm sau các trang đầu → duyệt hết các trang
    let found = false;
    for (let page = 1; !found && page <= 20; page++) {
      const r = await hr.get(`/api/notifications?size=100&page=${page}`);
      found = r.data.items.some((n) => n.type === "CONTRACT_EXPIRING");
      if (r.data.items.length < 100) break;
    }
    expect(found, "không có thông báo hợp đồng");
  });
  await test("Cron endpoint từ chối khi sai secret", async () => expectStatus(await new Client("x").post("/api/cron/daily", {}, { "x-cron-secret": "sai" }), 401));

  console.log("\n[Báo cáo]");
  for (const t of ["overview", "turnover", "attendance", "leave", "overtime", "contracts", "allocation", "kpi", "recruitment", "payroll"]) {
    await test(`Báo cáo ${t} (HR/Admin) → 200`, async () => expectStatus(await admin.get(`/reports?type=${t}&compare=1`), 200));
  }
  await test("Trưởng phòng không xem được báo cáo lương (không có trong danh sách)", async () => {
    const r = await mgr.get("/reports?type=payroll");
    expectStatus(r, 200);
    expect(!r.data.includes("Báo cáo chi phí tiền lương"), "trưởng phòng thấy báo cáo lương");
  });

  return { emp, mgr, hr, payroll, admin, lan, uyen };
}
