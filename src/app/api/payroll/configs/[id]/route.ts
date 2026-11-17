import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { dbDate, isDateKey } from "@/lib/dates";
import { calculatePayroll, payrollParamsSchema } from "@/lib/payroll-calc";
import { audit, diff } from "@/lib/audit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("update"), name: z.string().trim().min(3).max(120), effectiveFrom: z.string().refine(isDateKey), params: payrollParamsSchema }),
  z.object({ action: z.literal("activate"), verifiedNote: z.string().trim().min(20, "Ghi rõ căn cứ pháp lý/ người kiểm tra (tối thiểu 20 ký tự)").max(2000) }),
  z.object({ action: z.literal("archive") }),
]);

export const PATCH = api(async (req, { ctx, params: p }) => {
  requirePerm(ctx, "payroll.update", "COMPANY");
  const c = await prisma.payrollConfig.findUnique({ where: { id: p.id } });
  if (!c) throw new HttpError(404, "Cấu hình không tồn tại");
  const b = await parseBody(req, schema);
  if (b.action === "update") {
    if (c.status !== "DRAFT") throw new HttpError(409, "Chỉ sửa được bản nháp – hãy tạo phiên bản mới");
    await prisma.payrollConfig.update({ where: { id: c.id }, data: { name: b.name, effectiveFrom: dbDate(b.effectiveFrom), params: b.params as object } });
    await audit(ctx, { action: "UPDATE", entityType: "PayrollConfig", entityId: c.id, summary: `Sửa cấu hình lương v${c.version}`, changes: diff(c.params as never, b.params as never) }, req);
    return { ok: true };
  }
  if (b.action === "activate") {
    if (c.status !== "DRAFT") throw new HttpError(409, "Chỉ kích hoạt được bản nháp");
    const params = payrollParamsSchema.parse(c.params);
    // Kiểm tra trước khi sử dụng: chạy thử công thức với một hồ sơ mẫu để phát hiện cấu hình lỗi
    const probe = calculatePayroll(
      { payType: "MONTHLY", baseSalary: 20_000_000, insuranceSalary: null, dependents: 1, standardWorkdays: 22, actualWorkdays: 22, paidLeaveDays: 0, holidayDays: 0, unpaidLeaveDays: 0, workedHours: 176, overtimeHours: { weekday: 2, weekend: 0, holiday: 0 }, allowances: [], adjustments: [] },
      params,
    );
    if (!(probe.netPay > 0 && probe.netPay <= probe.grossIncome)) throw new HttpError(400, "Chạy thử công thức cho kết quả bất thường – kiểm tra lại tham số");
    await prisma.payrollConfig.update({ where: { id: c.id }, data: { status: "ACTIVE", verifiedNote: b.verifiedNote, verifiedById: ctx.userId, verifiedAt: new Date() } });
    await audit(ctx, { action: "UPDATE", entityType: "PayrollConfig", entityId: c.id, summary: `Xác minh & kích hoạt cấu hình lương v${c.version}: ${b.verifiedNote.slice(0, 200)}` }, req);
    return { ok: true, probe: { gross: probe.grossIncome, net: probe.netPay, pit: probe.pit, insurance: probe.insuranceEmployee } };
  }
  const inUse = await prisma.payrollPeriod.count({ where: { configId: c.id, status: { in: ["DRAFT", "CALCULATED", "APPROVED"] } } });
  if (inUse) throw new HttpError(409, `Còn ${inUse} kỳ lương chưa khoá đang dùng cấu hình này`);
  await prisma.payrollConfig.update({ where: { id: c.id }, data: { status: "ARCHIVED" } });
  await audit(ctx, { action: "UPDATE", entityType: "PayrollConfig", entityId: c.id, summary: `Lưu trữ cấu hình lương v${c.version}` }, req);
  return { ok: true };
});
