import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody, searchParams } from "@/lib/api";
import { assertEmployeeAccess, requirePerm } from "@/lib/rbac";
import { isDateKey } from "@/lib/dates";
import { HttpError } from "@/lib/errors";
import { available } from "@/lib/leave-calc";
import { computeDays, ensureBalance, pendingDays, submitLeave } from "@/lib/services/leave";

const schema = z.object({
  employeeId: z.string().optional(), // HR tạo đơn thay nhân viên
  leaveTypeId: z.string().min(1, "Chọn loại nghỉ"),
  startDate: z.string().refine(isDateKey, "Ngày bắt đầu không hợp lệ"),
  endDate: z.string().refine(isDateKey, "Ngày kết thúc không hợp lệ"),
  halfDay: z.enum(["NONE", "MORNING", "AFTERNOON"]).default("NONE"),
  reason: z.string().trim().min(3, "Nhập lý do").max(1000),
  attachmentId: z.string().nullable().optional(),
});

/** Xem trước: số ngày nghỉ thực tế (trừ ngày nghỉ tuần, ngày lễ) và số ngày phép còn lại */
export const GET = api(async (req, { ctx }) => {
  requirePerm(ctx, "leave.create");
  const sp = searchParams(req);
  const employeeId = sp.employeeId || ctx.employee?.id;
  if (!employeeId) throw new HttpError(400, "Tài khoản chưa liên kết hồ sơ nhân viên");
  if (employeeId !== ctx.employee?.id) {
    const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { id: true, departmentId: true, branchId: true, managerId: true } });
    assertEmployeeAccess(ctx, "leave.update", e);
  }
  if (!isDateKey(sp.start) || !isDateKey(sp.end) || sp.end < sp.start) return { days: 0, available: null };
  const half = (["NONE", "MORNING", "AFTERNOON"].includes(sp.halfDay) ? sp.halfDay : "NONE") as "NONE";
  if (half !== "NONE" && sp.start !== sp.end) return { days: 0, available: null, error: "Nghỉ nửa ngày chỉ áp dụng cho 1 ngày" };
  const days = await computeDays(employeeId, sp.start, sp.end, half);
  let avail: number | null = null;
  if (sp.type) {
    const t = await prisma.leaveType.findUnique({ where: { id: sp.type } });
    if (t?.deductsBalance) {
      const year = Number(sp.start.slice(0, 4));
      const bal = await ensureBalance(employeeId, t.id, year);
      avail = available(bal, await pendingDays(employeeId, t.id, year));
    }
  }
  return { days, available: avail };
});

export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "leave.create");
  const b = await parseBody(req, schema);
  let employeeId = ctx.employee?.id;
  if (b.employeeId && b.employeeId !== ctx.employee?.id) {
    const e = await prisma.employee.findUnique({ where: { id: b.employeeId }, select: { id: true, departmentId: true, branchId: true, managerId: true } });
    if (!e) throw new HttpError(404, "Nhân viên không tồn tại");
    assertEmployeeAccess(ctx, "leave.update", e);
    employeeId = e.id;
  }
  if (!employeeId) throw new HttpError(400, "Tài khoản chưa liên kết hồ sơ nhân viên");
  if (b.attachmentId) {
    const doc = await prisma.employeeDocument.findFirst({ where: { id: b.attachmentId, employeeId, deletedAt: null } });
    if (!doc) throw new HttpError(400, "File đính kèm không hợp lệ");
  }
  const lr = await submitLeave(ctx, employeeId, b, req);
  return { id: lr.id, days: lr.days };
});
