import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { can, employeeScopeWhere, type AuthCtx } from "../rbac";
import { addDays, dbDate, keyOf, monthRange, vnDateKey, yearsBetween } from "../dates";
import { HttpError } from "../errors";
import { buildTimesheet } from "./attendance";
import { kpiCompletion } from "../kpi-calc";
import { CANDIDATE_STAGE, CONTRACT_TYPE, EMPLOYEE_STATUS, EMPLOYMENT_TYPE, GENDER } from "../labels";

export const REPORTS = {
  overview: { title: "Tổng quan nhân sự", perm: "report.view" },
  turnover: { title: "Biến động nhân sự", perm: "report.view" },
  recruitment: { title: "Tuyển dụng", perm: "recruitment.view" },
  attendance: { title: "Chấm công", perm: "attendance.view" },
  leave: { title: "Nghỉ phép", perm: "leave.view" },
  overtime: { title: "Tăng ca", perm: "attendance.view" },
  payroll: { title: "Chi phí tiền lương", perm: "payroll.view" },
  kpi: { title: "KPI", perm: "kpi.view" },
  contracts: { title: "Hợp đồng lao động", perm: "contract.view" },
  allocation: { title: "Phân bổ nhân sự", perm: "report.view" },
} as const;
export type ReportType = keyof typeof REPORTS;

export interface ReportFilters {
  from: string; // YYYY-MM
  to: string; // YYYY-MM
  departmentId?: string;
  branchId?: string;
  compare?: boolean;
}

export interface ReportResult {
  title: string;
  period: string;
  summary: { label: string; value: number; prev?: number | null; fmt?: "number" | "vnd" | "percent" }[];
  chart?: { kind: "bar" | "line" | "hbar" | "stack"; xKey: string; series: { key: string; label: string; color?: number }[]; data: Record<string, string | number>[]; fmt?: "number" | "vnd" | "percent" };
  columns: { key: string; label: string; fmt?: "number" | "vnd" | "percent" | "text" }[];
  rows: Record<string, string | number | null>[];
  note?: string;
}

function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) (m = 1), y++;
  }
  return out.slice(0, 36);
}
const rangeOf = (from: string, to: string) => ({ start: `${from}-01`, end: monthRange(Number(to.slice(0, 4)), Number(to.slice(5))).to });
function prevRange(from: string, to: string) {
  const n = monthsBetween(from, to).length;
  const d = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5)) - 1 - n, 1));
  const pf = d.toISOString().slice(0, 7);
  const e = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5)) - 2, 1)).toISOString().slice(0, 7);
  return { from: pf, to: e };
}

export async function buildReport(ctx: AuthCtx, type: ReportType, f: ReportFilters): Promise<ReportResult> {
  const def = REPORTS[type];
  if (!def) throw new HttpError(404, "Loại báo cáo không tồn tại");
  if (!can(ctx, "report.view") || !can(ctx, def.perm)) throw new HttpError(403, "Bạn không có quyền xem báo cáo này");
  const scopeKey = ctx.perms["report.view"] === "COMPANY" ? def.perm : "report.view";
  const empWhere: Prisma.EmployeeWhereInput = {
    AND: [employeeScopeWhere(ctx, scopeKey), f.departmentId ? { departmentId: f.departmentId } : {}, f.branchId ? { branchId: f.branchId } : {}],
  };
  const { start, end } = rangeOf(f.from, f.to);
  const months = monthsBetween(f.from, f.to);
  const period = f.from === f.to ? `Tháng ${f.from.slice(5)}/${f.from.slice(0, 4)}` : `${f.from.slice(5)}/${f.from.slice(0, 4)} – ${f.to.slice(5)}/${f.to.slice(0, 4)}`;
  const base = { title: `Báo cáo ${def.title.toLowerCase()}`, period };
  const pr = prevRange(f.from, f.to);

  if (type === "overview" || type === "allocation") {
    const emps = await prisma.employee.findMany({
      where: { AND: [empWhere, { deactivatedAt: null }, { startDate: { lte: dbDate(end) } }, { OR: [{ endDate: null }, { endDate: { gt: dbDate(end) } }] }] },
      select: { status: true, gender: true, employmentType: true, startDate: true, dateOfBirth: true, department: { select: { name: true } }, branch: { select: { name: true } }, position: { select: { name: true } } },
    });
    const prevEnd = rangeOf(pr.from, pr.to).end;
    const prevCount = await prisma.employee.count({ where: { AND: [empWhere, { startDate: { lte: dbDate(prevEnd) } }, { OR: [{ endDate: null }, { endDate: { gt: dbDate(prevEnd) } }] }] } });
    if (type === "allocation") {
      const branches = [...new Set(emps.map((e) => e.branch?.name ?? "Chưa gán"))].sort();
      const depts = [...new Set(emps.map((e) => e.department?.name ?? "Chưa phân phòng"))].sort((a, b) => a.localeCompare(b, "vi"));
      const rows = depts.map((d) => {
        const r: Record<string, string | number> = { name: d };
        for (const b of branches) r[b] = emps.filter((e) => (e.department?.name ?? "Chưa phân phòng") === d && (e.branch?.name ?? "Chưa gán") === b).length;
        r.total = emps.filter((e) => (e.department?.name ?? "Chưa phân phòng") === d).length;
        return r;
      });
      return {
        ...base,
        summary: [
          { label: "Tổng nhân sự cuối kỳ", value: emps.length, prev: f.compare ? prevCount : undefined },
          { label: "Số phòng ban", value: depts.length },
          { label: "Số chi nhánh", value: branches.length },
        ],
        chart: { kind: "stack", xKey: "name", series: branches.slice(0, 5).map((b, i) => ({ key: b, label: b, color: i })), data: rows },
        columns: [{ key: "name", label: "Phòng ban" }, ...branches.map((b) => ({ key: b, label: b, fmt: "number" as const })), { key: "total", label: "Tổng", fmt: "number" }],
        rows,
      };
    }
    const group = <T extends string>(fn: (e: (typeof emps)[number]) => T) => {
      const m = new Map<T, number>();
      for (const e of emps) m.set(fn(e), (m.get(fn(e)) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const seniority = (e: (typeof emps)[number]) => {
      const y = yearsBetween(keyOf(e.startDate)!, end);
      return y < 1 ? "< 1 năm" : y < 3 ? "1–3 năm" : y < 5 ? "3–5 năm" : y < 10 ? "5–10 năm" : "≥ 10 năm";
    };
    const age = (e: (typeof emps)[number]) => {
      if (!e.dateOfBirth) return "Không rõ";
      const a = yearsBetween(keyOf(e.dateOfBirth)!, end);
      return a < 25 ? "< 25" : a < 35 ? "25–34" : a < 45 ? "35–44" : a < 55 ? "45–54" : "≥ 55";
    };
    const rows = [
      ...group((e) => EMPLOYEE_STATUS[e.status].label).map(([k, v]) => ({ group: "Trạng thái", item: k, count: v })),
      ...group((e) => e.department?.name ?? "Chưa phân phòng").map(([k, v]) => ({ group: "Phòng ban", item: k, count: v })),
      ...group((e) => EMPLOYMENT_TYPE[e.employmentType]).map(([k, v]) => ({ group: "Loại hình", item: k, count: v })),
      ...group((e) => GENDER[e.gender]).map(([k, v]) => ({ group: "Giới tính", item: k, count: v })),
      ...group(seniority).map(([k, v]) => ({ group: "Thâm niên", item: k, count: v })),
      ...group(age).map(([k, v]) => ({ group: "Độ tuổi", item: k, count: v })),
    ].map((r) => ({ ...r, pct: emps.length ? Math.round((r.count / emps.length) * 1000) / 10 : 0 }));
    return {
      ...base,
      summary: [
        { label: "Tổng nhân sự cuối kỳ", value: emps.length, prev: f.compare ? prevCount : undefined },
        { label: "Đang làm việc", value: emps.filter((e) => e.status === "ACTIVE").length },
        { label: "Thử việc", value: emps.filter((e) => e.status === "PROBATION").length },
        { label: "Thâm niên < 1 năm", value: emps.filter((e) => seniority(e) === "< 1 năm").length },
      ],
      chart: { kind: "hbar", xKey: "item", series: [{ key: "count", label: "Số nhân viên" }], data: rows.filter((r) => r.group === "Phòng ban") },
      columns: [
        { key: "group", label: "Nhóm" },
        { key: "item", label: "Phân loại" },
        { key: "count", label: "Số người", fmt: "number" },
        { key: "pct", label: "Tỷ lệ (%)", fmt: "number" },
      ],
      rows,
    };
  }

  if (type === "turnover") {
    const all = await prisma.employee.findMany({ where: empWhere, select: { startDate: true, endDate: true, status: true } });
    const calc = (ms: string[]) =>
      ms.map((m) => {
        const r = monthRange(Number(m.slice(0, 4)), Number(m.slice(5)));
        const head = (k: string) => all.filter((e) => keyOf(e.startDate)! <= k && (!e.endDate || keyOf(e.endDate)! >= k)).length;
        const hires = all.filter((e) => keyOf(e.startDate)! >= r.from && keyOf(e.startDate)! <= r.to).length;
        const leavers = all.filter((e) => e.status === "RESIGNED" && e.endDate && keyOf(e.endDate)! >= r.from && keyOf(e.endDate)! <= r.to).length;
        const avg = (head(r.from) + head(r.to)) / 2;
        return { month: `${m.slice(5)}/${m.slice(0, 4)}`, headStart: head(r.from), headEnd: head(r.to), hires, leavers, rate: avg ? Math.round((leavers / avg) * 1000) / 10 : 0 };
      });
    const rows = calc(months);
    const prevRows = f.compare ? calc(monthsBetween(pr.from, pr.to)) : [];
    const sum = (rs: typeof rows, k: "hires" | "leavers") => rs.reduce((s, r) => s + r[k], 0);
    const avgHead = rows.reduce((s, r) => s + (r.headStart + r.headEnd) / 2, 0) / Math.max(1, rows.length);
    return {
      ...base,
      summary: [
        { label: "Tuyển mới", value: sum(rows, "hires"), prev: f.compare ? sum(prevRows, "hires") : undefined },
        { label: "Nghỉ việc", value: sum(rows, "leavers"), prev: f.compare ? sum(prevRows, "leavers") : undefined },
        { label: "Tỷ lệ nghỉ việc kỳ (%)", value: avgHead ? Math.round((sum(rows, "leavers") / avgHead) * 1000) / 10 : 0, fmt: "percent" },
        { label: "Quân số cuối kỳ", value: rows[rows.length - 1]?.headEnd ?? 0 },
      ],
      chart: { kind: "bar", xKey: "month", series: [{ key: "hires", label: "Tuyển mới" }, { key: "leavers", label: "Nghỉ việc", color: 5 }], data: rows },
      columns: [
        { key: "month", label: "Tháng" },
        { key: "headStart", label: "Đầu kỳ", fmt: "number" },
        { key: "hires", label: "Tuyển mới", fmt: "number" },
        { key: "leavers", label: "Nghỉ việc", fmt: "number" },
        { key: "headEnd", label: "Cuối kỳ", fmt: "number" },
        { key: "rate", label: "Tỷ lệ nghỉ việc (%)", fmt: "number" },
      ],
      rows,
    };
  }

  if (type === "attendance" || type === "overtime") {
    const emps = await prisma.employee.findMany({
      where: { AND: [empWhere, { startDate: { lte: dbDate(end) } }, { OR: [{ endDate: null }, { endDate: { gte: dbDate(start) } }] }] },
      select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
      orderBy: { code: "asc" },
      take: 1000,
    });
    const today = vnDateKey();
    const effEnd = end < today ? end : today;
    if (type === "attendance") {
      const ts = start <= effEnd ? await buildTimesheet(emps, start, effEnd, today) : [];
      const rows = ts.map((r) => ({ code: r.employee.code, name: r.employee.fullName, dept: r.employee.department ?? "", scheduled: r.totals.scheduledDays, workdays: r.totals.workdays, paidLeave: r.totals.paidLeave, unpaid: r.totals.unpaidLeave, late: r.totals.lateCount, lateMin: r.totals.lateMinutes, absent: r.totals.absent, missing: r.totals.missing }));
      const total = (k: keyof (typeof rows)[number]) => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
      const byDept = new Map<string, { workdays: number; late: number; absent: number }>();
      for (const r of rows) {
        const v = byDept.get(r.dept) ?? { workdays: 0, late: 0, absent: 0 };
        v.workdays += r.workdays;
        v.late += r.late;
        v.absent += r.absent;
        byDept.set(r.dept, v);
      }
      return {
        ...base,
        summary: [
          { label: "Tổng ngày công", value: Math.round(total("workdays") * 10) / 10 },
          { label: "Lượt đi muộn", value: total("late") },
          { label: "Ngày vắng không phép", value: total("absent") },
          { label: "Thiếu giờ vào/ra", value: total("missing") },
        ],
        chart: { kind: "bar", xKey: "dept", series: [{ key: "late", label: "Đi muộn", color: 2 }, { key: "absent", label: "Vắng", color: 3 }], data: [...byDept.entries()].map(([dept, v]) => ({ dept: dept || "—", ...v })) },
        columns: [
          { key: "code", label: "Mã NV" },
          { key: "name", label: "Họ tên" },
          { key: "dept", label: "Phòng ban" },
          { key: "scheduled", label: "Công chuẩn", fmt: "number" },
          { key: "workdays", label: "Công thực tế", fmt: "number" },
          { key: "paidLeave", label: "Phép", fmt: "number" },
          { key: "unpaid", label: "Không lương", fmt: "number" },
          { key: "late", label: "Đi muộn (lần)", fmt: "number" },
          { key: "lateMin", label: "Phút muộn", fmt: "number" },
          { key: "absent", label: "Vắng", fmt: "number" },
          { key: "missing", label: "Thiếu giờ", fmt: "number" },
        ],
        rows,
      };
    }
    const ots = await prisma.overtimeRequest.findMany({ where: { employeeId: { in: emps.map((e) => e.id) }, status: "APPROVED", workDate: { gte: dbDate(start), lte: dbDate(end) } } });
    const prevOts = f.compare ? await prisma.overtimeRequest.aggregate({ where: { employeeId: { in: emps.map((e) => e.id) }, status: "APPROVED", workDate: { gte: dbDate(rangeOf(pr.from, pr.to).start), lte: dbDate(rangeOf(pr.from, pr.to).end) } }, _sum: { minutes: true } }) : null;
    const rows = emps
      .map((e) => {
        const mine = ots.filter((o) => o.employeeId === e.id);
        const h = (k?: string) => Math.round((mine.filter((o) => !k || o.dayKind === k).reduce((s, o) => s + o.minutes, 0) / 60) * 100) / 100;
        return { code: e.code, name: e.fullName, dept: e.department?.name ?? "", weekday: h("WEEKDAY"), weekend: h("WEEKEND"), holiday: h("HOLIDAY"), total: h(), count: mine.length };
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.total - a.total);
    return {
      ...base,
      summary: [
        { label: "Tổng giờ tăng ca", value: Math.round(rows.reduce((s, r) => s + r.total, 0) * 10) / 10, prev: prevOts ? Math.round(((prevOts._sum.minutes ?? 0) / 60) * 10) / 10 : undefined },
        { label: "Số người tăng ca", value: rows.length },
        { label: "Số lượt", value: rows.reduce((s, r) => s + r.count, 0) },
      ],
      chart: { kind: "stack", xKey: "name", series: [{ key: "weekday", label: "Ngày thường" }, { key: "weekend", label: "Cuối tuần", color: 2 }, { key: "holiday", label: "Ngày lễ", color: 3 }], data: rows.slice(0, 15) },
      columns: [
        { key: "code", label: "Mã NV" },
        { key: "name", label: "Họ tên" },
        { key: "dept", label: "Phòng ban" },
        { key: "weekday", label: "Ngày thường (h)", fmt: "number" },
        { key: "weekend", label: "Cuối tuần (h)", fmt: "number" },
        { key: "holiday", label: "Ngày lễ (h)", fmt: "number" },
        { key: "total", label: "Tổng (h)", fmt: "number" },
      ],
      rows,
    };
  }

  if (type === "leave") {
    const leaves = await prisma.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: dbDate(end) }, endDate: { gte: dbDate(start) }, employee: empWhere },
      include: { leaveType: { select: { name: true } }, employee: { select: { code: true, fullName: true, department: { select: { name: true } } } } },
    });
    const prevDays = f.compare
      ? (await prisma.leaveRequest.aggregate({ where: { status: "APPROVED", startDate: { gte: dbDate(rangeOf(pr.from, pr.to).start), lte: dbDate(rangeOf(pr.from, pr.to).end) }, employee: empWhere }, _sum: { days: true } }))._sum.days ?? 0
      : undefined;
    const types = [...new Set(leaves.map((l) => l.leaveType.name))];
    const byEmp = new Map<string, Record<string, string | number>>();
    for (const l of leaves) {
      const k = l.employee.code;
      const r = byEmp.get(k) ?? { code: k, name: l.employee.fullName, dept: l.employee.department?.name ?? "", total: 0 };
      r[l.leaveType.name] = Number(r[l.leaveType.name] ?? 0) + l.days;
      r.total = Number(r.total) + l.days;
      byEmp.set(k, r);
    }
    const byType = types.map((t) => ({ type: t, days: leaves.filter((l) => l.leaveType.name === t).reduce((s, l) => s + l.days, 0) }));
    return {
      ...base,
      summary: [
        { label: "Tổng ngày nghỉ đã duyệt", value: leaves.reduce((s, l) => s + l.days, 0), prev: prevDays },
        { label: "Số đơn", value: leaves.length },
        { label: "Số người nghỉ", value: byEmp.size },
      ],
      note: "Đơn nghỉ trải qua 2 kỳ được tính toàn bộ số ngày vào kỳ chứa ngày bắt đầu/giao với kỳ báo cáo.",
      chart: { kind: "hbar", xKey: "type", series: [{ key: "days", label: "Số ngày" }], data: byType },
      columns: [{ key: "code", label: "Mã NV" }, { key: "name", label: "Họ tên" }, { key: "dept", label: "Phòng ban" }, ...types.map((t) => ({ key: t, label: t, fmt: "number" as const })), { key: "total", label: "Tổng", fmt: "number" }],
      rows: [...byEmp.values()].sort((a, b) => Number(b.total) - Number(a.total)),
    };
  }

  if (type === "payroll") {
    const periods = await prisma.payrollPeriod.findMany({
      where: { status: { in: ["CALCULATED", "APPROVED", "LOCKED"] }, startDate: { gte: dbDate(start) }, endDate: { lte: dbDate(end) } },
      include: { records: { where: { employee: empWhere }, include: { employee: { select: { department: { select: { name: true } } } } } } },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    const prevPeriods = f.compare
      ? await prisma.payrollPeriod.findMany({ where: { status: { in: ["CALCULATED", "APPROVED", "LOCKED"] }, startDate: { gte: dbDate(rangeOf(pr.from, pr.to).start) }, endDate: { lte: dbDate(rangeOf(pr.from, pr.to).end) } }, include: { records: { where: { employee: empWhere } } } })
      : [];
    const sum = (ps: { records: { grossIncome: number; insuranceEmployer: number; netPay: number; pit: number; insuranceEmployee: number }[] }[], k: "grossIncome" | "insuranceEmployer" | "netPay" | "pit") => ps.reduce((s, p) => s + p.records.reduce((x, r) => x + r[k], 0), 0);
    const rows = periods.map((p) => ({
      period: p.name,
      status: p.status,
      headcount: p.records.length,
      gross: p.records.reduce((s, r) => s + r.grossIncome, 0),
      insEmp: p.records.reduce((s, r) => s + r.insuranceEmployee, 0),
      insEr: p.records.reduce((s, r) => s + r.insuranceEmployer, 0),
      pit: p.records.reduce((s, r) => s + r.pit, 0),
      net: p.records.reduce((s, r) => s + r.netPay, 0),
      cost: p.records.reduce((s, r) => s + r.grossIncome + r.insuranceEmployer, 0),
    }));
    return {
      ...base,
      summary: [
        { label: "Tổng chi phí (thu nhập + BH DN)", value: sum(periods, "grossIncome") + sum(periods, "insuranceEmployer"), prev: f.compare ? sum(prevPeriods, "grossIncome") + sum(prevPeriods, "insuranceEmployer") : undefined, fmt: "vnd" },
        { label: "Tổng thực lĩnh", value: sum(periods, "netPay"), fmt: "vnd" },
        { label: "Thuế TNCN khấu trừ", value: sum(periods, "pit"), fmt: "vnd" },
      ],
      note: periods.length === 0 ? "Chưa có kỳ lương đã tính trong khoảng thời gian này." : undefined,
      chart: { kind: "stack", xKey: "period", fmt: "vnd", series: [{ key: "gross", label: "Tổng thu nhập" }, { key: "insEr", label: "BH doanh nghiệp", color: 1 }], data: rows },
      columns: [
        { key: "period", label: "Kỳ lương" },
        { key: "headcount", label: "Số người", fmt: "number" },
        { key: "gross", label: "Tổng thu nhập", fmt: "vnd" },
        { key: "insEmp", label: "BH người LĐ", fmt: "vnd" },
        { key: "insEr", label: "BH doanh nghiệp", fmt: "vnd" },
        { key: "pit", label: "Thuế TNCN", fmt: "vnd" },
        { key: "net", label: "Thực lĩnh", fmt: "vnd" },
        { key: "cost", label: "Tổng chi phí", fmt: "vnd" },
      ],
      rows,
    };
  }

  if (type === "kpi") {
    const assigns = await prisma.kpiAssignment.findMany({
      where: { period: { gte: f.from, lte: f.to + "~" }, employee: empWhere },
      include: { definition: true, results: { orderBy: { recordedAt: "desc" }, take: 1 }, employee: { select: { code: true, fullName: true, department: { select: { name: true } } } } },
    });
    const byEmp = new Map<string, { code: string; name: string; dept: string; w: number; s: number; n: number }>();
    for (const a of assigns) {
      const c = kpiCompletion(a.definition.direction, a.target, a.results[0]?.value);
      const k = a.employee!.code;
      const r = byEmp.get(k) ?? { code: k, name: a.employee!.fullName, dept: a.employee!.department?.name ?? "", w: 0, s: 0, n: 0 };
      r.n++;
      if (c !== null) (r.w += a.weight), (r.s += a.weight * c);
      byEmp.set(k, r);
    }
    const rows = [...byEmp.values()].map((r) => ({ code: r.code, name: r.name, dept: r.dept, kpis: r.n, score: r.w ? Math.round((r.s / r.w) * 1000) / 10 : null })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    const scored = rows.filter((r) => r.score !== null);
    return {
      ...base,
      summary: [
        { label: "Nhân viên có KPI", value: rows.length },
        { label: "Điểm bình quân (%)", value: scored.length ? Math.round((scored.reduce((s, r) => s + r.score!, 0) / scored.length) * 10) / 10 : 0, fmt: "percent" },
        { label: "Đạt ≥ 100%", value: scored.filter((r) => r.score! >= 100).length },
      ],
      chart: { kind: "hbar", xKey: "name", fmt: "percent", series: [{ key: "score", label: "% hoàn thành", color: 4 }], data: scored.slice(0, 15) as never },
      columns: [{ key: "code", label: "Mã NV" }, { key: "name", label: "Họ tên" }, { key: "dept", label: "Phòng ban" }, { key: "kpis", label: "Số KPI", fmt: "number" }, { key: "score", label: "Hoàn thành (%)", fmt: "number" }],
      rows,
    };
  }

  if (type === "recruitment") {
    const jobs = await prisma.recruitmentJob.findMany({
      where: { ...(f.departmentId ? { departmentId: f.departmentId } : {}), ...(f.branchId ? { branchId: f.branchId } : {}), OR: [{ status: { in: ["OPEN", "ON_HOLD"] } }, { updatedAt: { gte: dbDate(start) } }] },
      include: { candidates: { select: { stage: true, createdAt: true, updatedAt: true } }, department: { select: { name: true } } },
    });
    const stages = Object.keys(CANDIDATE_STAGE);
    const rows = jobs.map((j) => ({
      code: j.code,
      title: j.title,
      dept: j.department?.name ?? "",
      headcount: j.headcount,
      total: j.candidates.length,
      ...Object.fromEntries(stages.map((s) => [s, j.candidates.filter((c) => c.stage === s).length])),
    }));
    const all = jobs.flatMap((j) => j.candidates);
    const hired = all.filter((c) => c.stage === "HIRED");
    const avgDays = hired.length ? Math.round(hired.reduce((s, c) => s + (c.updatedAt.getTime() - c.createdAt.getTime()) / 86400_000, 0) / hired.length) : 0;
    return {
      ...base,
      summary: [
        { label: "Vị trí đang tuyển", value: jobs.filter((j) => j.status === "OPEN").length },
        { label: "Tổng ứng viên", value: all.length },
        { label: "Đã tiếp nhận", value: hired.length },
        { label: "Thời gian tuyển TB (ngày)", value: avgDays },
      ],
      chart: { kind: "bar", xKey: "stage", series: [{ key: "count", label: "Ứng viên" }], data: stages.map((s) => ({ stage: CANDIDATE_STAGE[s].label, count: all.filter((c) => c.stage === s).length })) },
      columns: [{ key: "code", label: "Mã" }, { key: "title", label: "Vị trí" }, { key: "dept", label: "Phòng ban" }, { key: "headcount", label: "Chỉ tiêu", fmt: "number" }, { key: "total", label: "Ứng viên", fmt: "number" }, ...stages.map((s) => ({ key: s, label: CANDIDATE_STAGE[s].label, fmt: "number" as const }))],
      rows,
    };
  }

  // contracts
  const today = vnDateKey();
  const contracts = await prisma.employmentContract.findMany({
    where: { employee: { AND: [empWhere, { deactivatedAt: null, status: { not: "RESIGNED" } }] }, status: { in: ["ACTIVE", "EXPIRED"] } },
    include: { employee: { select: { code: true, fullName: true, department: { select: { name: true } } } } },
    orderBy: { endDate: "asc" },
  });
  const noContract = await prisma.employee.count({ where: { AND: [empWhere, { deactivatedAt: null, status: { not: "RESIGNED" } }, { contracts: { none: { status: "ACTIVE" } } }] } });
  const in30 = addDays(today, 30);
  const rows = contracts.map((c) => {
    const e = keyOf(c.endDate);
    const days = e ? Math.round((dbDate(e).getTime() - dbDate(today).getTime()) / 86400_000) : null;
    return { code: c.code, emp: c.employee.fullName, dept: c.employee.department?.name ?? "", type: CONTRACT_TYPE[c.type], start: keyOf(c.startDate)!.split("-").reverse().join("/"), end: e ? e.split("-").reverse().join("/") : "Không thời hạn", daysLeft: days, status: c.status === "EXPIRED" || (days !== null && days < 0) ? "Đã hết hạn" : days !== null && e! <= in30 ? "Sắp hết hạn" : "Hiệu lực" };
  });
  return {
    ...base,
    period: `Tại ngày ${today.split("-").reverse().join("/")}`,
    summary: [
      { label: "Hợp đồng hiệu lực", value: rows.filter((r) => r.status !== "Đã hết hạn").length },
      { label: "Sắp hết hạn (30 ngày)", value: rows.filter((r) => r.status === "Sắp hết hạn").length },
      { label: "Đã hết hạn chưa xử lý", value: rows.filter((r) => r.status === "Đã hết hạn").length },
      { label: "Nhân viên chưa có HĐ hiệu lực", value: noContract },
    ],
    chart: { kind: "bar", xKey: "type", series: [{ key: "count", label: "Số hợp đồng" }], data: Object.values(CONTRACT_TYPE).map((t) => ({ type: t, count: rows.filter((r) => r.type === t).length })) },
    columns: [
      { key: "code", label: "Số HĐ" },
      { key: "emp", label: "Nhân viên" },
      { key: "dept", label: "Phòng ban" },
      { key: "type", label: "Loại" },
      { key: "start", label: "Bắt đầu" },
      { key: "end", label: "Kết thúc" },
      { key: "daysLeft", label: "Còn (ngày)", fmt: "number" },
      { key: "status", label: "Tình trạng" },
    ],
    rows,
  };
}
