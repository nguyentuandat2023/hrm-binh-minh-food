// DỮ LIỆU DEMO – CHỈ DÙNG CHO MÔI TRƯỜNG PHÁT TRIỂN/KIỂM THỬ. KHÔNG CHẠY TRÊN PRODUCTION.
// Mật khẩu tài khoản demo được sinh ngẫu nhiên và ghi vào .devdb/demo-accounts.txt (không commit).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");

import { PrismaClient, type EmployeeStatus, type Gender, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedBaseline } from "./seed-lib";
import { blindIndex, encrypt, generateTempPassword } from "../src/lib/crypto";
import { addDays, dayOfWeek, eachDay, vnDateKey, vnDateTime, type DateKey } from "../src/lib/dates";
import { computeAttendance, pickShiftId, shiftWindow, type AssignmentLite } from "../src/lib/attendance-calc";
import { annualEntitlement, countLeaveDays } from "../src/lib/leave-calc";

if (process.env.NODE_ENV === "production") {
  console.error("Từ chối chạy seed demo khi NODE_ENV=production");
  process.exit(1);
}

const prisma = new PrismaClient();
const D = (k: DateKey) => new Date(k + "T00:00:00Z");

let seed = 20261117;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

async function main() {
  const already = await prisma.employee.count();
  if (already > 0 && !process.argv.includes("--force")) {
    console.log("Đã có dữ liệu nhân viên – bỏ qua seed demo (dùng --force sau khi reset DB).");
    return;
  }
  await seedBaseline(prisma);
  const today = vnDateKey();
  const yesterday = addDays(today, -1);

  await prisma.companySetting.upsert({
    where: { key: "company" },
    create: { key: "company", value: { name: "Công ty TNHH Demo Việt (DỮ LIỆU MẪU)", shortName: "Demo Việt", address: "Hà Nội", industry: "Thương mại – Dịch vụ" } },
    update: {},
  });

  // ---------- Chi nhánh, phòng ban, chức vụ ----------
  const hn = await prisma.branch.create({ data: { code: "HN", name: "Trụ sở Hà Nội", address: "Cầu Giấy, Hà Nội", latitude: 21.0285, longitude: 105.8048, gpsRadiusM: 300 } });
  const hcm = await prisma.branch.create({ data: { code: "HCM", name: "Chi nhánh TP.HCM", address: "Quận 1, TP.HCM", latitude: 10.7769, longitude: 106.7009, gpsRadiusM: 300 } });

  const dept = async (code: string, name: string, branchId: string, parentId: string | null, sortOrder: number) =>
    prisma.department.create({ data: { code, name, branchId, parentId, sortOrder } });
  const bgd = await dept("BGD", "Ban Giám đốc", hn.id, null, 0);
  const hcns = await dept("HCNS", "Hành chính – Nhân sự", hn.id, bgd.id, 1);
  const kt = await dept("KT", "Kế toán", hn.id, bgd.id, 2);
  const kd = await dept("KD", "Kinh doanh miền Bắc", hn.id, bgd.id, 3);
  const kdn = await dept("KDN", "Kinh doanh miền Nam", hcm.id, bgd.id, 4);
  const kth = await dept("KTH", "Kỹ thuật", hn.id, bgd.id, 5);
  const vh = await dept("VH", "Vận hành kho", hcm.id, bgd.id, 6);

  const pos = async (code: string, name: string, level: number, departmentId: string | null) =>
    prisma.position.create({ data: { code, name, level, departmentId } });
  const P = {
    ceo: await pos("GD", "Giám đốc", 10, bgd.id),
    pgd: await pos("PGD", "Phó Giám đốc", 9, bgd.id),
    tp: await pos("TP", "Trưởng phòng", 7, null),
    hr: await pos("CVNS", "Chuyên viên nhân sự", 4, hcns.id),
    ktt: await pos("KTT", "Kế toán trưởng", 7, kt.id),
    ktl: await pos("KTL", "Kế toán tiền lương", 4, kt.id),
    sale: await pos("NVKD", "Nhân viên kinh doanh", 3, null),
    dev: await pos("LTV", "Lập trình viên", 4, kth.id),
    qa: await pos("QA", "Kiểm thử phần mềm", 4, kth.id),
    tc: await pos("TC", "Trưởng ca", 5, vh.id),
    kho: await pos("NVK", "Nhân viên kho", 2, vh.id),
  };

  const shifts = Object.fromEntries((await prisma.workShift.findMany()).map((s) => [s.code, s]));
  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.key, r]));

  // ---------- Nhân viên ----------
  type Seed = {
    name: string; gender: Gender; dob: DateKey; dept: string; pos: string; branch: string; start: DateKey;
    status?: EmployeeStatus; role: string; salary: number; head?: boolean; end?: DateKey; type?: "FULL_TIME" | "PART_TIME" | "INTERN";
  };
  const people: Seed[] = [
    { name: "Nguyễn Văn An", gender: "MALE", dob: "1975-03-12", dept: bgd.id, pos: P.ceo.id, branch: hn.id, start: "2015-01-05", role: "DIRECTOR", salary: 80000000, head: true },
    { name: "Trần Thị Bình", gender: "FEMALE", dob: "1980-11-21", dept: bgd.id, pos: P.pgd.id, branch: hn.id, start: "2016-06-01", role: "DIRECTOR", salary: 60000000 },
    { name: "Lê Thu Hà", gender: "FEMALE", dob: "1987-07-09", dept: hcns.id, pos: P.tp.id, branch: hn.id, start: "2018-03-01", role: "HR_ADMIN", salary: 30000000, head: true },
    { name: "Phạm Minh Châu", gender: "FEMALE", dob: "1995-11-30", dept: hcns.id, pos: P.hr.id, branch: hn.id, start: "2021-08-16", role: "HR_ADMIN", salary: 15000000 },
    { name: "Hoàng Văn Dũng", gender: "MALE", dob: "1983-02-17", dept: kt.id, pos: P.ktt.id, branch: hn.id, start: "2017-09-01", role: "PAYROLL", salary: 32000000, head: true },
    { name: "Vũ Thị Hoa", gender: "FEMALE", dob: "1993-05-25", dept: kt.id, pos: P.ktl.id, branch: hn.id, start: "2020-02-10", role: "PAYROLL", salary: 16000000 },
    { name: "Đặng Quốc Huy", gender: "MALE", dob: "1986-11-05", dept: kd.id, pos: P.tp.id, branch: hn.id, start: "2017-04-03", role: "DEPT_MANAGER", salary: 35000000, head: true },
    { name: "Bùi Thanh Tùng", gender: "MALE", dob: "1994-08-14", dept: kd.id, pos: P.sale.id, branch: hn.id, start: "2019-10-01", role: "EMPLOYEE", salary: 14000000 },
    { name: "Ngô Thị Lan", gender: "FEMALE", dob: "1996-12-02", dept: kd.id, pos: P.sale.id, branch: hn.id, start: "2020-07-15", role: "EMPLOYEE", salary: 13000000 },
    { name: "Đỗ Minh Khoa", gender: "MALE", dob: "1998-11-18", dept: kd.id, pos: P.sale.id, branch: hn.id, start: "2022-03-01", role: "EMPLOYEE", salary: 12000000 },
    { name: "Phan Thị Mai", gender: "FEMALE", dob: "1999-04-27", dept: kd.id, pos: P.sale.id, branch: hn.id, start: "2026-09-21", status: "PROBATION", role: "EMPLOYEE", salary: 10000000 },
    { name: "Trịnh Văn Nam", gender: "MALE", dob: "1997-01-08", dept: kd.id, pos: P.sale.id, branch: hn.id, start: "2021-05-10", status: "RESIGNED", end: "2026-10-31", role: "EMPLOYEE", salary: 12500000 },
    { name: "Lý Hoàng Phúc", gender: "MALE", dob: "1988-09-19", dept: kdn.id, pos: P.tp.id, branch: hcm.id, start: "2018-11-12", role: "DEPT_MANAGER", salary: 33000000, head: true },
    { name: "Châu Ngọc Quyên", gender: "FEMALE", dob: "1995-11-11", dept: kdn.id, pos: P.sale.id, branch: hcm.id, start: "2020-04-01", role: "EMPLOYEE", salary: 13500000 },
    { name: "Tạ Minh Sơn", gender: "MALE", dob: "1996-06-30", dept: kdn.id, pos: P.sale.id, branch: hcm.id, start: "2023-01-09", role: "EMPLOYEE", salary: 12000000 },
    { name: "Mai Thị Thảo", gender: "FEMALE", dob: "2000-02-14", dept: kdn.id, pos: P.sale.id, branch: hcm.id, start: "2026-10-12", status: "PROBATION", role: "EMPLOYEE", salary: 10000000 },
    { name: "Đinh Công Thành", gender: "MALE", dob: "1985-10-03", dept: kth.id, pos: P.tp.id, branch: hn.id, start: "2016-08-01", role: "DEPT_MANAGER", salary: 45000000, head: true },
    { name: "Hồ Ngọc Uyên", gender: "FEMALE", dob: "1994-11-24", dept: kth.id, pos: P.dev.id, branch: hn.id, start: "2019-06-17", role: "EMPLOYEE", salary: 28000000 },
    { name: "Kiều Văn Việt", gender: "MALE", dob: "1997-03-03", dept: kth.id, pos: P.dev.id, branch: hn.id, start: "2021-11-01", role: "EMPLOYEE", salary: 24000000 },
    { name: "La Thị Xuân", gender: "FEMALE", dob: "1999-09-09", dept: kth.id, pos: P.qa.id, branch: hn.id, start: "2023-07-03", role: "EMPLOYEE", salary: 18000000 },
    { name: "Âu Đức Long", gender: "MALE", dob: "1989-12-12", dept: vh.id, pos: P.tc.id, branch: hcm.id, start: "2019-01-14", role: "DEPT_MANAGER", salary: 16000000, head: true },
    { name: "Quách Văn Minh", gender: "MALE", dob: "1995-11-20", dept: vh.id, pos: P.kho.id, branch: hcm.id, start: "2020-10-05", role: "EMPLOYEE", salary: 9000000 },
    { name: "Lục Thị Nga", gender: "FEMALE", dob: "1998-07-21", dept: vh.id, pos: P.kho.id, branch: hcm.id, start: "2022-02-21", role: "EMPLOYEE", salary: 8500000 },
    { name: "Tôn Thất Bảo", gender: "MALE", dob: "1993-04-04", dept: vh.id, pos: P.kho.id, branch: hcm.id, start: "2021-03-15", role: "EMPLOYEE", salary: 8800000 },
  ];

  const demoPassword = generateTempPassword(12) + "Aa1";
  const adminPassword = generateTempPassword(14) + "Aa1";
  const hash = await bcrypt.hash(demoPassword, 10);
  const adminHash = await bcrypt.hash(adminPassword, 10);
  const accounts: string[] = [];
  const emps: { id: string; seed: Seed; code: string }[] = [];
  const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().split(" ");

  let n = 0;
  for (const p of people) {
    n++;
    const code = "NV" + String(n).padStart(4, "0");
    const parts = slug(p.name);
    const email = `${parts[parts.length - 1]}.${parts.slice(0, -1).map((x) => x[0]).join("")}${n}@example.com`;
    const nid = "0" + String(ri(10, 99)) + String(ri(1000000, 9999999)) + String(ri(100, 999));
    const status: EmployeeStatus = p.status ?? "ACTIVE";
    const e = await prisma.employee.create({
      data: {
        code,
        fullName: p.name,
        gender: p.gender,
        dateOfBirth: D(p.dob),
        email,
        phone: "09" + String(ri(10000000, 99999999)),
        address: p.branch === hn.id ? "Hà Nội" : "TP. Hồ Chí Minh",
        nationalIdEnc: encrypt(nid),
        nationalIdHash: blindIndex(nid),
        emergencyName: "Người thân của " + p.name.split(" ").pop(),
        emergencyPhone: "09" + String(ri(10000000, 99999999)),
        emergencyRelation: "Gia đình",
        departmentId: p.dept,
        positionId: p.pos,
        branchId: p.branch,
        startDate: D(p.start),
        employmentType: p.type ?? "FULL_TIME",
        status,
        probationEndDate: status === "PROBATION" ? D(addDays(p.start, 60)) : null,
        endDate: p.end ? D(p.end) : null,
        salaryProfile: {
          create: {
            payType: "MONTHLY",
            baseSalary: p.salary,
            insuranceSalary: Math.round(p.salary * 0.8),
            dependents: ri(0, 2),
            bankName: "Ngân hàng TMCP (mẫu)",
            bankAccountEnc: encrypt(String(ri(100000000, 999999999)) + String(ri(1000, 9999))),
            bankAccountName: slug(p.name).join(" ").toUpperCase(),
          },
        },
        allowances: { create: [{ name: "Ăn trưa", amount: 730000, taxable: false }, ...(p.salary >= 20000000 ? [{ name: "Điện thoại", amount: 500000, taxable: true }] : [])] },
      },
    });
    emps.push({ id: e.id, seed: p, code });
    if (p.head) await prisma.department.update({ where: { id: p.dept }, data: { headId: e.id } });
    if (status !== "RESIGNED") {
      await prisma.user.create({ data: { email, passwordHash: hash, employeeId: e.id, roles: { create: [{ roleId: roles[p.role].id }] } } });
      accounts.push(`${p.role.padEnd(13)} ${email}  (${p.name})`);
    }
  }
  await prisma.sequence.upsert({ where: { name: "employee" }, create: { name: "employee", value: n }, update: { value: n } });

  // Quản lý trực tiếp: nhân viên → trưởng phòng; trưởng phòng → giám đốc
  const depts = await prisma.department.findMany();
  const ceo = emps[0];
  for (const e of emps) {
    const d = depts.find((x) => x.id === e.seed.dept)!;
    const managerId = e.seed.head ? (e.id === ceo.id ? null : ceo.id) : d.headId === e.id ? ceo.id : d.headId ?? ceo.id;
    await prisma.employee.update({ where: { id: e.id }, data: { managerId } });
  }

  await prisma.user.create({
    data: { email: "admin@example.com", passwordHash: adminHash, roles: { create: [{ roleId: roles.SUPER_ADMIN.id }] } },
  });

  // ---------- Hợp đồng ----------
  let c = 0;
  for (const e of emps) {
    c++;
    const code = `HD-${e.seed.start.slice(0, 4)}-${String(c).padStart(4, "0")}`;
    if (e.seed.status === "PROBATION") {
      await prisma.employmentContract.create({ data: { employeeId: e.id, code, type: "PROBATION", startDate: D(e.seed.start), signedDate: D(e.seed.start), endDate: D(addDays(e.seed.start, 60)), baseSalary: e.seed.salary } });
    } else if (c % 4 === 0) {
      await prisma.employmentContract.create({ data: { employeeId: e.id, code, type: "INDEFINITE", startDate: D(e.seed.start), signedDate: D(e.seed.start), baseSalary: e.seed.salary } });
    } else {
      // Một số hợp đồng hết hạn trong 30 ngày tới để kiểm thử cảnh báo
      const end = c % 3 === 0 ? addDays(today, ri(5, 28)) : addDays(today, ri(90, 600));
      await prisma.employmentContract.create({
        data: { employeeId: e.id, code, type: "FIXED_TERM", startDate: D(addDays(end, -730)), signedDate: D(addDays(end, -735)), endDate: D(end), baseSalary: e.seed.salary, status: e.seed.status === "RESIGNED" ? "TERMINATED" : "ACTIVE" },
      });
    }
  }

  // ---------- Phân ca xoay cho bộ phận vận hành (Sáng → Chiều → Đêm theo tuần, T2–T7) ----------
  const vhStaff = emps.filter((e) => e.seed.dept === vh.id && !e.seed.head);
  const rotation = [shifts.SANG.id, shifts.CHIEU.id, shifts.DEM.id];
  let weekStart = "2026-08-31"; // Thứ Hai
  let w = 0;
  while (weekStart <= "2026-12-31") {
    for (let i = 0; i < vhStaff.length; i++) {
      await prisma.shiftAssignment.create({
        data: { employeeId: vhStaff[i].id, shiftId: rotation[(w + i) % 3], startDate: D(weekStart), endDate: D(addDays(weekStart, 6)), daysOfWeek: [1, 2, 3, 4, 5, 6], note: "Ca xoay theo tuần" },
      });
    }
    weekStart = addDays(weekStart, 7);
    w++;
  }
  const vhHead = emps.find((e) => e.seed.dept === vh.id && e.seed.head)!;
  await prisma.shiftAssignment.create({ data: { employeeId: vhHead.id, shiftId: shifts.HC.id, startDate: D("2026-01-01"), daysOfWeek: [1, 2, 3, 4, 5, 6] } });

  // ---------- Nghỉ phép ----------
  const leaveTypes = Object.fromEntries((await prisma.leaveType.findMany()).map((t) => [t.code, t]));
  const holidays = new Set((await prisma.holiday.findMany()).map((h) => h.date.toISOString().slice(0, 10)));
  const allAssign = await prisma.shiftAssignment.findMany();
  const assignOf = (empId: string): AssignmentLite[] =>
    allAssign.filter((a) => a.employeeId === empId).map((a) => ({ shiftId: a.shiftId, startDate: a.startDate.toISOString().slice(0, 10), endDate: a.endDate?.toISOString().slice(0, 10) ?? null, daysOfWeek: a.daysOfWeek }));
  const fallback = { defaultShiftId: shifts.HC.id, workingDays: [1, 2, 3, 4, 5] };
  const shiftOn = (empId: string, d: DateKey) => {
    const id = pickShiftId(assignOf(empId), d, fallback);
    return id ? Object.values(shifts).find((s) => s.id === id)! : null;
  };
  const isWorking = (empId: string) => (d: DateKey) => !!shiftOn(empId, d) && !holidays.has(d);

  for (const e of emps) {
    await prisma.leaveBalance.create({
      data: { employeeId: e.id, leaveTypeId: leaveTypes.ANNUAL.id, year: 2026, entitled: annualEntitlement(e.seed.start, 2026, { annualBaseDays: 12, seniorityStepYears: 5, seniorityExtraDays: 1, prorateFirstYear: true }) },
    });
  }

  const userOf = async (empId: string) => (await prisma.user.findUnique({ where: { employeeId: empId } }))?.id ?? null;
  const approverFor = async (empId: string) => {
    const e = await prisma.employee.findUniqueOrThrow({ where: { id: empId } });
    return (e.managerId && (await userOf(e.managerId))) || (await userOf(emps[2].id));
  };
  const leaveReqs: { emp: number; type: string; start: DateKey; end: DateKey; half?: "MORNING" | "AFTERNOON"; status: "APPROVED" | "PENDING" | "REJECTED"; reason: string }[] = [
    { emp: 7, type: "ANNUAL", start: "2026-09-14", end: "2026-09-15", status: "APPROVED", reason: "Việc gia đình" },
    { emp: 8, type: "ANNUAL", start: "2026-10-05", end: "2026-10-05", half: "AFTERNOON", status: "APPROVED", reason: "Khám sức khoẻ" },
    { emp: 17, type: "ANNUAL", start: "2026-10-19", end: "2026-10-23", status: "APPROVED", reason: "Du lịch cùng gia đình" },
    { emp: 18, type: "UNPAID", start: "2026-11-09", end: "2026-11-10", status: "APPROVED", reason: "Việc riêng" },
    { emp: 13, type: "ANNUAL", start: today, end: today, status: "APPROVED", reason: "Việc cá nhân" },
    { emp: 19, type: "ANNUAL", start: addDays(today, 3), end: addDays(today, 7), status: "PENDING", reason: "Về quê" },
    { emp: 9, type: "ANNUAL", start: addDays(today, 1), end: addDays(today, 1), status: "PENDING", reason: "Đưa con đi khám" },
    { emp: 22, type: "ANNUAL", start: "2026-10-12", end: "2026-10-12", status: "REJECTED", reason: "Việc gia đình" },
  ];
  for (const l of leaveReqs) {
    const e = emps[l.emp];
    const days = countLeaveDays(l.start, l.end, l.half ?? "NONE", isWorking(e.id));
    if (days <= 0) continue;
    const t = leaveTypes[l.type];
    const lr = await prisma.leaveRequest.create({
      data: { employeeId: e.id, leaveTypeId: t.id, startDate: D(l.start), endDate: D(l.end), halfDay: l.half ?? "NONE", days, reason: l.reason, status: l.status, decidedAt: l.status === "PENDING" ? null : new Date() },
    });
    const levels = days >= 3 ? 2 : 1;
    const ar = await prisma.approvalRequest.create({
      data: {
        type: "LEAVE", entityId: lr.id, employeeId: e.id, requesterUserId: await userOf(e.id), title: `${t.name} ${days} ngày`,
        status: l.status, requiredLevels: levels, currentLevel: l.status === "PENDING" ? 1 : levels, decidedAt: l.status === "PENDING" ? null : new Date(),
      },
    });
    if (l.status !== "PENDING") {
      const actor = await approverFor(e.id);
      if (actor) await prisma.approvalStep.create({ data: { requestId: ar.id, level: 1, actorUserId: actor, decision: l.status, comment: l.status === "REJECTED" ? "Thời điểm cao điểm, đề nghị chọn ngày khác" : null } });
      if (l.status === "APPROVED" && levels === 2) {
        const hrUser = await userOf(emps[2].id);
        if (hrUser && hrUser !== actor) await prisma.approvalStep.create({ data: { requestId: ar.id, level: 2, actorUserId: hrUser, decision: "APPROVED" } });
      }
    }
    if (l.status === "APPROVED" && t.deductsBalance) {
      await prisma.leaveBalance.update({ where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: t.id, year: 2026 } }, data: { used: { increment: days } } });
    }
  }
  const approvedLeaves = await prisma.leaveRequest.findMany({ where: { status: "APPROVED" } });

  // ---------- Chấm công 01/09 → hôm nay ----------
  const now = new Date();
  const records: Prisma.AttendanceRecordCreateManyInput[] = [];
  for (const e of emps) {
    const from = e.seed.start > "2026-09-01" ? e.seed.start : "2026-09-01";
    const to = e.seed.end && e.seed.end < today ? e.seed.end : today;
    for (const d of eachDay(from, to)) {
      const s = shiftOn(e.id, d);
      if (!s || holidays.has(d)) continue;
      const lv = approvedLeaves.find((l) => l.employeeId === e.id && l.startDate.toISOString().slice(0, 10) <= d && l.endDate.toISOString().slice(0, 10) >= d);
      if (lv && lv.halfDay === "NONE") continue;
      const roll = rand();
      if (roll < 0.025 && d !== today) continue; // vắng không phép
      const win = shiftWindow(d, s);
      let inAt = new Date(win.start.getTime() - ri(0, 20) * 60000);
      if (roll > 0.9) inAt = new Date(win.start.getTime() + ri(8, 45) * 60000); // đi muộn
      let outAt: Date | null = new Date(win.end.getTime() + ri(0, 35) * 60000);
      if (roll > 0.86 && roll <= 0.9) outAt = new Date(win.end.getTime() - ri(15, 60) * 60000); // về sớm
      if (roll > 0.83 && roll <= 0.86) outAt = null; // quên chấm ra
      if (lv && lv.halfDay === "AFTERNOON") outAt = vnDateTime(d, "12:00");
      if (inAt > now) continue;
      if (outAt && outAt > now) outAt = null;
      if (d === today && roll < 0.12) continue; // hôm nay: một số chưa chấm
      const res = computeAttendance(d, s, inAt, outAt);
      records.push({ employeeId: e.id, workDate: D(d), shiftId: s.id, checkInAt: inAt, checkOutAt: outAt, checkInMethod: rand() < 0.5 ? "QR" : "WEB", checkOutMethod: outAt ? "WEB" : null, ...res });
    }
  }
  await prisma.attendanceRecord.createMany({ data: records });

  // ---------- Tăng ca & điều chỉnh công ----------
  const otPeople = [17, 18, 19];
  for (const idx of otPeople) {
    for (const d of ["2026-10-08", "2026-10-22", "2026-11-05"]) {
      const start = vnDateTime(d, "17:30");
      const end = vnDateTime(d, "20:00");
      const ot = await prisma.overtimeRequest.create({ data: { employeeId: emps[idx].id, workDate: D(d), startAt: start, endAt: end, minutes: 150, reason: "Triển khai phiên bản phần mềm", status: "APPROVED", decidedAt: new Date() } });
      await prisma.approvalRequest.create({ data: { type: "OVERTIME", entityId: ot.id, employeeId: emps[idx].id, title: `Tăng ca ${d.split("-").reverse().join("/")} (2.5h)`, status: "APPROVED", decidedAt: new Date() } });
    }
  }
  const pendingOtDay = addDays(today, 2);
  const pot = await prisma.overtimeRequest.create({ data: { employeeId: emps[18].id, workDate: D(pendingOtDay), startAt: vnDateTime(pendingOtDay, "17:30"), endAt: vnDateTime(pendingOtDay, "21:00"), minutes: 210, reason: "Hỗ trợ khách hàng xử lý sự cố", dayKind: "WEEKDAY" } });
  await prisma.approvalRequest.create({ data: { type: "OVERTIME", entityId: pot.id, employeeId: emps[18].id, requesterUserId: await userOf(emps[18].id), title: `Tăng ca ${pendingOtDay.split("-").reverse().join("/")} (3.5h)` } });

  const missing = await prisma.attendanceRecord.findFirst({ where: { checkOutAt: null, workDate: { lt: D(today) }, employee: { departmentId: kd.id } }, include: { shift: true } });
  if (missing?.shift) {
    const wd = missing.workDate.toISOString().slice(0, 10);
    const adj = await prisma.attendanceAdjustment.create({ data: { employeeId: missing.employeeId, workDate: missing.workDate, requestedCheckOut: vnDateTime(wd, missing.shift.endTime), reason: "Quên chấm công ra, đã làm đủ giờ" } });
    await prisma.approvalRequest.create({ data: { type: "ATTENDANCE_ADJUSTMENT", entityId: adj.id, employeeId: missing.employeeId, requesterUserId: await userOf(missing.employeeId), title: `Điều chỉnh công ngày ${wd.split("-").reverse().join("/")}` } });
  }

  // ---------- KPI ----------
  const kpiDefs = {
    revenue: await prisma.kpiDefinition.create({ data: { code: "DOANH_SO", name: "Doanh số", category: "SALES", unit: "triệu VND", description: "Doanh số ký hợp đồng trong kỳ" } }),
    clients: await prisma.kpiDefinition.create({ data: { code: "KH_MOI", name: "Khách hàng mới", category: "SALES", unit: "khách hàng" } }),
    ontime: await prisma.kpiDefinition.create({ data: { code: "DUNG_HAN", name: "Tỷ lệ hoàn thành đúng hạn", category: "PROGRESS", unit: "%" } }),
    bugs: await prisma.kpiDefinition.create({ data: { code: "LOI", name: "Số lỗi sau phát hành", category: "QUALITY", unit: "lỗi", direction: "LOWER_BETTER" } }),
    personal: await prisma.kpiDefinition.create({ data: { code: "MT_CN", name: "Mục tiêu cá nhân", category: "PERSONAL", unit: "%" } }),
  };
  const salesIdx = [7, 8, 9, 10, 13, 14, 15];
  for (const period of ["2026-09", "2026-10", "2026-11"]) {
    for (const idx of salesIdx) {
      const e = emps[idx];
      if (e.seed.start > `${period}-28`) continue;
      const a1 = await prisma.kpiAssignment.create({ data: { definitionId: kpiDefs.revenue.id, employeeId: e.id, period, target: 500, weight: 0.6, status: period === "2026-11" ? "OPEN" : "REVIEWED" } });
      const a2 = await prisma.kpiAssignment.create({ data: { definitionId: kpiDefs.clients.id, employeeId: e.id, period, target: 8, weight: 0.4, status: period === "2026-11" ? "OPEN" : "REVIEWED" } });
      const factor = period === "2026-11" ? 0.55 : 1;
      await prisma.kpiResult.create({ data: { assignmentId: a1.id, value: Math.round(ri(320, 640) * factor), note: "Cập nhật theo báo cáo bán hàng" } });
      await prisma.kpiResult.create({ data: { assignmentId: a2.id, value: Math.round(ri(4, 11) * factor) } });
    }
    for (const idx of [17, 18, 19]) {
      const a1 = await prisma.kpiAssignment.create({ data: { definitionId: kpiDefs.ontime.id, employeeId: emps[idx].id, period, target: 95, weight: 0.7, status: period === "2026-11" ? "OPEN" : "REVIEWED" } });
      const a2 = await prisma.kpiAssignment.create({ data: { definitionId: kpiDefs.bugs.id, employeeId: emps[idx].id, period, target: 3, weight: 0.3, status: period === "2026-11" ? "OPEN" : "REVIEWED" } });
      await prisma.kpiResult.create({ data: { assignmentId: a1.id, value: ri(82, 100) } });
      await prisma.kpiResult.create({ data: { assignmentId: a2.id, value: ri(1, 5) } });
    }
  }
  await prisma.kpiAssignment.create({ data: { definitionId: kpiDefs.revenue.id, departmentId: kd.id, period: "2026-11", target: 2500, weight: 1 } });

  // ---------- Tuyển dụng ----------
  const job1 = await prisma.recruitmentJob.create({ data: { code: "TD-0001", title: "Nhân viên kinh doanh B2B", departmentId: kd.id, positionId: P.sale.id, branchId: hn.id, headcount: 2, salaryRange: "10–15 triệu + hoa hồng", status: "OPEN", deadline: D(addDays(today, 20)), description: "Phát triển khách hàng doanh nghiệp khu vực miền Bắc.", requirements: "Tốt nghiệp CĐ/ĐH; ưu tiên có kinh nghiệm B2B." } });
  const job2 = await prisma.recruitmentJob.create({ data: { code: "TD-0002", title: "Lập trình viên Backend", departmentId: kth.id, positionId: P.dev.id, branchId: hn.id, headcount: 1, salaryRange: "20–30 triệu", status: "OPEN", deadline: D(addDays(today, 35)), requirements: "Node.js, PostgreSQL, 2+ năm kinh nghiệm." } });
  const cands: [string, string, "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER" | "REJECTED"][] = [
    [job1.id, "Nguyễn Hữu Thắng", "APPLIED"], [job1.id, "Lê Thị Kim Oanh", "SCREENING"], [job1.id, "Phạm Văn Lộc", "INTERVIEW"],
    [job1.id, "Trần Bảo Ngọc", "OFFER"], [job1.id, "Hà Minh Trí", "REJECTED"], [job2.id, "Võ Quang Hiếu", "INTERVIEW"],
    [job2.id, "Đoàn Thu Trang", "SCREENING"], [job2.id, "Cao Văn Tâm", "APPLIED"],
  ];
  let ci = 0;
  for (const [jobId, name, stage] of cands) {
    ci++;
    const cand = await prisma.candidate.create({ data: { jobId, fullName: name, email: `ungvien${ci}@example.com`, phone: "09" + String(ri(10000000, 99999999)), source: ci % 2 ? "Website tuyển dụng" : "Giới thiệu", stage, rating: stage === "REJECTED" ? 2 : ri(3, 5) } });
    if (stage === "INTERVIEW" || stage === "OFFER") {
      await prisma.interview.create({ data: { candidateId: cand.id, scheduledAt: vnDateTime(addDays(today, stage === "OFFER" ? -5 : ri(1, 4)), "09:30"), location: "Phòng họp tầng 3", interviewers: "Trưởng phòng, HR", result: stage === "OFFER" ? "PASS" : "PENDING", score: stage === "OFFER" ? 8 : null } });
    }
  }

  // ---------- Tài sản ----------
  const assetsData: [string, string, "LAPTOP" | "PHONE" | "OFFICE_EQUIPMENT" | "TOOL", number | null, number][] = [
    ["TS-0001", "Laptop Dell Latitude 5440", "LAPTOP", 18, 24500000],
    ["TS-0002", "Laptop ThinkPad E14", "LAPTOP", 19, 21000000],
    ["TS-0003", "MacBook Air M3", "LAPTOP", 17, 27900000],
    ["TS-0004", "Laptop HP ProBook 450", "LAPTOP", 3, 18500000],
    ["TS-0005", "iPhone 15 (máy công ty)", "PHONE", 6, 19990000],
    ["TS-0006", "Máy in Canon LBP", "OFFICE_EQUIPMENT", null, 6500000],
    ["TS-0007", "Máy quét mã vạch Zebra", "TOOL", 21, 8900000],
    ["TS-0008", "Laptop Asus Vivobook", "LAPTOP", null, 15900000],
    ["TS-0009", "Màn hình Dell 24 inch", "OFFICE_EQUIPMENT", 17, 4200000],
    ["TS-0010", "Điện thoại Samsung A55", "PHONE", null, 9500000],
  ];
  const assigner = await userOf(emps[2].id);
  for (const [code, name, category, holderIdx, cost] of assetsData) {
    const holder = holderIdx !== null ? emps[holderIdx] : null;
    const a = await prisma.asset.create({
      data: { code, name, category, purchaseCost: cost, purchaseDate: D("2025-06-15"), serialNumber: "SN" + ri(100000, 999999), status: holder ? "ASSIGNED" : "AVAILABLE", condition: "Tốt", currentHolderId: holder?.id ?? null, branchId: holder?.seed.branch ?? hn.id },
    });
    if (holder) {
      await prisma.assetAssignment.create({ data: { assetId: a.id, employeeId: holder.id, assignedAt: new Date(D(holder.seed.start > "2025-06-15" ? holder.seed.start : "2025-07-01").getTime() + 9 * 3600_000), conditionOut: "Tốt", assignedById: assigner } });
    }
  }
  await prisma.sequence.upsert({ where: { name: "asset" }, create: { name: "asset", value: 10 }, update: { value: 10 } });
  await prisma.sequence.upsert({ where: { name: "job" }, create: { name: "job", value: 2 }, update: { value: 2 } });

  // ---------- Tiếp nhận / nghỉ việc ----------
  const onboard = emps[10];
  const tpl = (await import("../src/lib/settings")).defaultSetting("templates");
  await prisma.lifecycleChecklist.create({
    data: {
      type: "ONBOARDING", employeeId: onboard.id, mentorId: emps[7].id, targetDate: D(addDays(onboard.seed.start, 60)),
      tasks: { create: tpl.onboardingTasks.map((t, i) => ({ title: t.title, category: t.category, sort: i, assigneeId: emps[3].id, dueDate: D(addDays(onboard.seed.start, 3 + i * 7)), doneAt: i < 4 ? new Date() : null })) },
    },
  });
  const leaver = emps[11];
  await prisma.lifecycleChecklist.create({
    data: {
      type: "OFFBOARDING", employeeId: leaver.id, targetDate: D(leaver.seed.end!), reason: "Nghỉ việc theo nguyện vọng cá nhân", status: "COMPLETED", completedAt: new Date(D(leaver.seed.end!).getTime() + 10 * 3600_000),
      tasks: { create: tpl.offboardingTasks.map((t, i) => ({ title: t.title, category: t.category, sort: i, assigneeId: emps[3].id, doneAt: new Date() })) },
    },
  });

  // ---------- Ghi danh sách tài khoản demo ----------
  mkdirSync(".devdb", { recursive: true });
  const text = [
    "TÀI KHOẢN DEMO – CHỈ DÙNG KIỂM THỬ (file này không được commit)",
    `Super Admin: admin@example.com  mật khẩu: ${adminPassword}`,
    `Mật khẩu chung cho các tài khoản nhân viên demo: ${demoPassword}`,
    "",
    ...accounts,
  ].join("\n");
  writeFileSync(".devdb/demo-accounts.txt", text, "utf8");
  console.log(`✔ Seed demo xong: ${emps.length} nhân viên, ${records.length} bản ghi chấm công. Ngày hiện tại (VN): ${today}, hôm qua: ${yesterday}.`);
  console.log("  Danh sách tài khoản & mật khẩu: .devdb/demo-accounts.txt");
  void dayOfWeek;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
