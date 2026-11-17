import type { EmployeeStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { addDays, dbDate, eachDay, keyOf, monthRange, vnDateKey, vnDateTime } from "../dates";
import { employeeScopeWhere, type AuthCtx } from "../rbac";
import { kpiCompletion } from "../kpi-calc";
import { loadScheduleContext, shiftFor } from "./attendance";
import { getSetting } from "../settings";

export interface DashboardFilters {
  month: string; // YYYY-MM
  departmentId?: string;
  branchId?: string;
  status?: EmployeeStatus;
}

export async function getDashboard(ctx: AuthCtx, f: DashboardFilters) {
  const [year, month] = f.month.split("-").map(Number);
  const range = monthRange(year, month);
  const today = vnDateKey();
  const scope = employeeScopeWhere(ctx, "dashboard.view");
  const base: Prisma.EmployeeWhereInput = {
    AND: [scope, f.departmentId ? { departmentId: f.departmentId } : {}, f.branchId ? { branchId: f.branchId } : {}, { deactivatedAt: null }],
  };
  const current: Prisma.EmployeeWhereInput = { AND: [base, f.status ? { status: f.status } : { status: { not: "RESIGNED" } }] };

  const notify = await getSetting("notifications");
  const [employees, allForTrend, newHires, leavers] = await Promise.all([
    prisma.employee.findMany({
      where: current,
      select: { id: true, fullName: true, code: true, gender: true, status: true, dateOfBirth: true, departmentId: true, avatarFileId: true, department: { select: { name: true } }, position: { select: { name: true } } },
    }),
    prisma.employee.findMany({ where: base, select: { id: true, startDate: true, endDate: true, status: true } }),
    prisma.employee.count({ where: { AND: [base, { startDate: { gte: dbDate(range.from), lte: dbDate(range.to) } }] } }),
    prisma.employee.count({ where: { AND: [base, { status: "RESIGNED", endDate: { gte: dbDate(range.from), lte: dbDate(range.to) } }] } }),
  ]);
  const ids = employees.map((e) => e.id);
  const activeIds = employees.filter((e) => e.status !== "RESIGNED").map((e) => e.id);

  // ---- Hôm nay: nghỉ phép, đi muộn, chưa chấm công ----
  const [leavesToday, recordsToday, sctx] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { employeeId: { in: activeIds }, status: "APPROVED", startDate: { lte: dbDate(today) }, endDate: { gte: dbDate(today) } },
      select: { employeeId: true, halfDay: true },
    }),
    prisma.attendanceRecord.findMany({ where: { employeeId: { in: activeIds }, workDate: { in: [dbDate(today), dbDate(addDays(today, -1))] } } }),
    loadScheduleContext(activeIds, today, today),
  ]);
  const onLeaveToday = new Set(leavesToday.map((l) => l.employeeId));
  const todayRecords = recordsToday.filter((r) => keyOf(r.workDate) === today);
  const lateToday = todayRecords.filter((r) => r.lateMinutes > 0).length;
  const checkedIn = new Set(recordsToday.filter((r) => r.checkInAt && (keyOf(r.workDate) === today || !r.checkOutAt)).map((r) => r.employeeId));
  const now = new Date();
  const notCheckedIn = activeIds.filter((id) => {
    if (onLeaveToday.has(id) || checkedIn.has(id) || sctx.holidays.has(today)) return false;
    const s = shiftFor(sctx, id, today);
    return !!s && vnDateTime(today, s.startTime) < now;
  }).length;

  // ---- Hợp đồng sắp hết hạn, sinh nhật, chờ duyệt ----
  const expiryLimit = addDays(today, notify.contractExpiryDays);
  const [expiringContracts, pendingApprovals] = await Promise.all([
    prisma.employmentContract.findMany({
      where: { employeeId: { in: activeIds }, status: "ACTIVE", endDate: { gte: dbDate(today), lte: dbDate(expiryLimit) } },
      include: { employee: { select: { id: true, fullName: true, code: true } } },
      orderBy: { endDate: "asc" },
    }),
    prisma.approvalRequest.count({ where: { status: "PENDING", employeeId: { in: ids } } }),
  ]);
  const birthdays = employees
    .filter((e) => e.dateOfBirth && e.dateOfBirth.getUTCMonth() + 1 === month)
    .map((e) => ({ id: e.id, fullName: e.fullName, day: e.dateOfBirth!.getUTCDate(), department: e.department?.name ?? "" }))
    .sort((a, b) => a.day - b.day);

  // ---- Biến động 12 tháng ----
  const trend: { month: string; hires: number; leavers: number; headcount: number; turnover: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    const r = monthRange(d.getUTCFullYear(), d.getUTCMonth() + 1);
    const label = `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCFullYear()).slice(2)}`;
    const hires = allForTrend.filter((e) => keyOf(e.startDate)! >= r.from && keyOf(e.startDate)! <= r.to).length;
    const left = allForTrend.filter((e) => e.status === "RESIGNED" && e.endDate && keyOf(e.endDate)! >= r.from && keyOf(e.endDate)! <= r.to).length;
    const headAt = (k: string) => allForTrend.filter((e) => keyOf(e.startDate)! <= k && (!e.endDate || keyOf(e.endDate)! >= k)).length;
    const avg = (headAt(r.from) + headAt(r.to)) / 2;
    trend.push({ month: label, hires, leavers: left, headcount: headAt(r.to), turnover: avg ? Math.round((left / avg) * 1000) / 10 : 0 });
  }

  // ---- Cơ cấu phòng ban & giới tính ----
  const deptMap = new Map<string, number>();
  for (const e of employees) deptMap.set(e.department?.name ?? "Chưa phân phòng", (deptMap.get(e.department?.name ?? "Chưa phân phòng") ?? 0) + 1);
  const byDepartment = [...deptMap.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const gender = {
    male: employees.filter((e) => e.gender === "MALE").length,
    female: employees.filter((e) => e.gender === "FEMALE").length,
    other: employees.filter((e) => e.gender === "OTHER" || e.gender === "UNDISCLOSED").length,
  };

  // ---- Chấm công trong tháng (theo ngày) ----
  const to = range.to < today ? range.to : today;
  let attendanceDaily: { day: string; onTime: number; late: number; missing: number }[] = [];
  if (range.from <= today) {
    const monthRecs = await prisma.attendanceRecord.findMany({
      where: { employeeId: { in: activeIds }, workDate: { gte: dbDate(range.from), lte: dbDate(to) } },
      select: { workDate: true, lateMinutes: true, checkInAt: true, checkOutAt: true },
    });
    const byDay = new Map<string, { onTime: number; late: number; missing: number }>();
    for (const r of monthRecs) {
      const k = keyOf(r.workDate)!;
      const v = byDay.get(k) ?? { onTime: 0, late: 0, missing: 0 };
      if (!r.checkInAt || (!r.checkOutAt && k < today)) v.missing++;
      else if (r.lateMinutes > 0) v.late++;
      else v.onTime++;
      byDay.set(k, v);
    }
    attendanceDaily = eachDay(range.from, to)
      .filter((k) => byDay.has(k))
      .map((k) => ({ day: k.slice(8, 10) + "/" + k.slice(5, 7), ...byDay.get(k)! }));
  }

  // ---- Chi phí nhân sự (chỉ khi có quyền xem lương) ----
  const canMoney = ctx.perms["payroll.view"] === "COMPANY" || ctx.perms["salary.view"] === "COMPANY";
  let payrollCost: { period: string; gross: number; employer: number }[] | null = null;
  let monthCost: { value: number; source: "payroll" | "estimate" } | null = null;
  if (canMoney) {
    const periods = await prisma.payrollPeriod.findMany({
      where: { status: { in: ["CALCULATED", "APPROVED", "LOCKED"] } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 6,
      include: { records: { where: { employeeId: { in: ids } }, select: { grossIncome: true, insuranceEmployer: true } } },
    });
    payrollCost = periods.reverse().map((p) => ({
      period: `${String(p.month).padStart(2, "0")}/${p.year}`,
      gross: p.records.reduce((s, r) => s + r.grossIncome, 0),
      employer: p.records.reduce((s, r) => s + r.insuranceEmployer, 0),
    }));
    const thisPeriod = periods.find((p) => p.year === year && p.month === month);
    if (thisPeriod) {
      monthCost = { value: thisPeriod.records.reduce((s, r) => s + r.grossIncome + r.insuranceEmployer, 0), source: "payroll" };
    } else {
      const profiles = await prisma.salaryProfile.findMany({ where: { employeeId: { in: activeIds } }, select: { baseSalary: true, payType: true } });
      const allowances = await prisma.employeeAllowance.aggregate({ where: { employeeId: { in: activeIds } }, _sum: { amount: true } });
      monthCost = { value: profiles.filter((p) => p.payType === "MONTHLY").reduce((s, p) => s + p.baseSalary, 0) + (allowances._sum.amount ?? 0), source: "estimate" };
    }
  }

  // ---- KPI theo phòng ban (kỳ tháng đang chọn) ----
  const kpis = await prisma.kpiAssignment.findMany({
    where: { period: f.month, employeeId: { in: ids } },
    include: { definition: { select: { direction: true } }, results: { orderBy: { recordedAt: "desc" }, take: 1 }, employee: { select: { department: { select: { name: true } } } } },
  });
  const kpiDept = new Map<string, { sum: number; n: number }>();
  for (const k of kpis) {
    const c = kpiCompletion(k.definition.direction, k.target, k.results[0]?.value);
    if (c === null) continue;
    const name = k.employee?.department?.name ?? "Khác";
    const v = kpiDept.get(name) ?? { sum: 0, n: 0 };
    v.sum += c;
    v.n++;
    kpiDept.set(name, v);
  }
  const kpiByDepartment = [...kpiDept.entries()].map(([name, v]) => ({ name, completion: Math.round((v.sum / v.n) * 1000) / 10 }));

  return {
    stats: {
      total: employees.length,
      active: employees.filter((e) => e.status === "ACTIVE").length,
      probation: employees.filter((e) => e.status === "PROBATION").length,
      leaveOfAbsence: employees.filter((e) => e.status === "LEAVE_OF_ABSENCE").length,
      newHires,
      leavers,
      onLeaveToday: onLeaveToday.size,
      lateToday,
      notCheckedIn,
      expiringContracts: expiringContracts.length,
      pendingApprovals,
    },
    monthCost,
    expiringContracts: expiringContracts.slice(0, 8).map((c) => ({ id: c.id, code: c.code, endDate: keyOf(c.endDate)!, employee: c.employee })),
    birthdays,
    trend,
    byDepartment,
    gender,
    attendanceDaily,
    payrollCost,
    kpiByDepartment,
    expiryDays: notify.contractExpiryDays,
  };
}
