import { prisma } from "../db";
import { dbDate, eachDay, keyOf, monthRange, vnDateKey, dayOfWeek } from "../dates";
import { HttpError } from "../errors";
import { getSetting } from "../settings";
import { calculatePayroll, payrollParamsSchema, type PayrollParams } from "../payroll-calc";
import { buildTimesheet } from "./attendance";
import { audit } from "../audit";
import type { AuthCtx } from "../rbac";

/** Cấu hình lương đang hiệu lực (ACTIVE, đã xác minh) cho ngày `date` */
export async function activeConfigFor(date: string) {
  return prisma.payrollConfig.findFirst({
    where: { status: "ACTIVE", verifiedAt: { not: null }, effectiveFrom: { lte: dbDate(date) } },
    orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
  });
}

export async function createPeriod(ctx: AuthCtx, month: string, req?: Request) {
  const [y, m] = month.split("-").map(Number);
  const r = monthRange(y, m);
  if (await prisma.payrollPeriod.findUnique({ where: { code: month } })) throw new HttpError(409, `Kỳ lương ${month} đã tồn tại`);
  const att = await getSetting("attendance");
  const holidays = await prisma.holiday.findMany({ where: { date: { gte: dbDate(r.from), lte: dbDate(r.to) } } });
  // Công chuẩn tham khảo theo lịch công ty (ngày làm việc, đã gồm ngày lễ hưởng lương)
  const std = eachDay(r.from, r.to).filter((d) => att.workingDays.includes(dayOfWeek(d))).length;
  const config = await activeConfigFor(r.from);
  const p = await prisma.payrollPeriod.create({
    data: { code: month, name: `Lương tháng ${String(m).padStart(2, "0")}/${y}`, year: y, month: m, startDate: dbDate(r.from), endDate: dbDate(r.to), standardWorkdays: std, configId: config?.id ?? null },
  });
  await audit(ctx, { action: "CREATE", entityType: "PayrollPeriod", entityId: p.id, summary: `Tạo ${p.name} (công chuẩn ${std}, ${holidays.length} ngày lễ)` }, req);
  return p;
}

export interface CalcWarning {
  employee: string;
  message: string;
}

export async function calculatePeriod(ctx: AuthCtx, periodId: string, req?: Request) {
  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw new HttpError(404, "Kỳ lương không tồn tại");
  if (period.status === "APPROVED" || period.status === "LOCKED") throw new HttpError(409, "Kỳ lương đã duyệt/khoá – không thể tính lại");
  const from = keyOf(period.startDate)!;
  const to = keyOf(period.endDate)!;
  const config = (period.configId ? await prisma.payrollConfig.findUnique({ where: { id: period.configId } }) : null) ?? (await activeConfigFor(from));
  if (!config || config.status !== "ACTIVE" || !config.verifiedAt) {
    throw new HttpError(400, "Chưa có cấu hình lương đã được xác minh và kích hoạt cho kỳ này. Vào Tiền lương → Cấu hình lương để kiểm tra và kích hoạt.");
  }
  const parsed = payrollParamsSchema.safeParse(config.params);
  if (!parsed.success) throw new HttpError(400, "Cấu hình lương không hợp lệ: " + parsed.error.issues[0]?.message);
  const params: PayrollParams = parsed.data;

  const emps = await prisma.employee.findMany({
    where: { startDate: { lte: period.endDate }, OR: [{ endDate: null }, { endDate: { gte: period.startDate } }] },
    select: { id: true, code: true, fullName: true, startDate: true, endDate: true, deactivatedAt: true, department: { select: { name: true } }, salaryProfile: true, allowances: true },
    orderBy: { code: "asc" },
  });
  const warnings: CalcWarning[] = [];
  const payable = emps.filter((e) => {
    if (!e.salaryProfile || e.salaryProfile.baseSalary <= 0) {
      warnings.push({ employee: `${e.code} ${e.fullName}`, message: "Chưa thiết lập lương cơ bản – không tính lương" });
      return false;
    }
    return true;
  });
  const today = vnDateKey();
  const tsEnd = to < today ? to : today;
  if (from > today) throw new HttpError(400, "Kỳ lương chưa bắt đầu");
  const rows = await buildTimesheet(payable, from, to, tsEnd);
  const [ots, adjustments] = await Promise.all([
    prisma.overtimeRequest.findMany({ where: { employeeId: { in: payable.map((e) => e.id) }, status: "APPROVED", workDate: { gte: period.startDate, lte: period.endDate } } }),
    prisma.payrollAdjustment.findMany({ where: { periodId } }),
  ]);
  if (to >= today) warnings.push({ employee: "Toàn kỳ", message: "Kỳ lương chưa kết thúc – số công tính đến hôm nay, cần tính lại sau khi kết thúc tháng" });

  const results = payable.map((e) => {
    const row = rows.find((r) => r.employee.id === e.id)!;
    const t = row.totals;
    const sp = e.salaryProfile!;
    const std = params.standardWorkdaysMode === "FIXED" ? params.fixedStandardWorkdays : Math.max(1, t.scheduledDays);
    const otH = (kind: string) => ots.filter((o) => o.employeeId === e.id && o.dayKind === kind).reduce((s, o) => s + o.minutes, 0) / 60;
    // Không tính ngày lễ trước ngày vào làm / sau ngày nghỉ việc
    const startKey = keyOf(e.startDate)!;
    const endKey = keyOf(e.endDate);
    const holidayDays = row.cells.filter((c) => c.status === "HOLIDAY" && c.date >= startKey && (!endKey || c.date <= endKey)).length;
    const input = {
      payType: sp.payType,
      baseSalary: sp.baseSalary,
      insuranceSalary: sp.insuranceSalary,
      dependents: sp.dependents,
      standardWorkdays: std,
      actualWorkdays: t.workdays,
      paidLeaveDays: t.paidLeave,
      holidayDays,
      unpaidLeaveDays: t.unpaidLeave + t.absent,
      workedHours: Math.round((t.workedMinutes / 60) * 100) / 100,
      overtimeHours: { weekday: otH("WEEKDAY"), weekend: otH("WEEKEND"), holiday: otH("HOLIDAY") },
      allowances: e.allowances.map((a) => ({ name: a.name, amount: a.amount, taxable: a.taxable })),
      adjustments: adjustments.filter((a) => a.employeeId === e.id).map((a) => ({ type: a.type, amount: a.amount, taxable: a.taxable, note: a.note })),
    };
    const out = calculatePayroll(input, params);
    if (out.netPay < 0) warnings.push({ employee: `${e.code} ${e.fullName}`, message: "Thực lĩnh âm – kiểm tra khoản khấu trừ/tạm ứng" });
    if (t.missing > 0) warnings.push({ employee: `${e.code} ${e.fullName}`, message: `${t.missing} ngày thiếu giờ vào/ra chưa được điều chỉnh` });
    return { e, input, out, t };
  });

  await prisma.$transaction(
    async (tx) => {
      const cur = await tx.payrollPeriod.findUniqueOrThrow({ where: { id: periodId } });
      if (cur.status === "APPROVED" || cur.status === "LOCKED") throw new HttpError(409, "Kỳ lương vừa được duyệt/khoá");
      await tx.payrollRecord.deleteMany({ where: { periodId } });
      for (const { e, input, out } of results) {
        await tx.payrollRecord.create({
          data: {
            periodId,
            employeeId: e.id,
            payType: input.payType,
            baseSalary: input.baseSalary,
            standardWorkdays: input.standardWorkdays,
            actualWorkdays: input.actualWorkdays,
            paidLeaveDays: input.paidLeaveDays,
            holidayDays: input.holidayDays,
            unpaidLeaveDays: input.unpaidLeaveDays,
            workedHours: input.workedHours,
            overtimeHours: input.overtimeHours.weekday + input.overtimeHours.weekend + input.overtimeHours.holiday,
            grossIncome: out.grossIncome,
            taxableIncome: out.taxableIncome,
            insuranceEmployee: out.insuranceEmployee,
            insuranceEmployer: out.insuranceEmployer,
            pit: out.pit,
            totalDeductions: out.totalDeductions,
            netPay: out.netPay,
            breakdown: { input, assessableIncome: out.assessableIncome, configVersion: config.version } as object,
            items: { create: out.lines.map((l, i) => ({ code: l.code, name: l.name, kind: l.kind, amount: l.amount, taxable: l.taxable, sort: i })) },
          },
        });
      }
      await tx.payrollPeriod.update({ where: { id: periodId }, data: { status: "CALCULATED", calculatedAt: new Date(), calculatedById: ctx.userId, configId: config.id } });
      await audit(ctx, { action: "PAYROLL_CALCULATED", entityType: "PayrollPeriod", entityId: periodId, summary: `Tính ${period.name}: ${results.length} người, cấu hình v${config.version}` }, req, tx);
    },
    { timeout: 120_000 },
  );
  return { count: results.length, warnings };
}
