import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { assertEmployeeAccess, requirePerm } from "@/lib/rbac";
import { addDays, dbDate, isDateKey, isHHmm, vnDateTime } from "@/lib/dates";
import { recomputeRecord } from "@/lib/services/attendance";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

const schema = z.object({
  employeeId: z.string(),
  workDate: z.string().refine(isDateKey, "Ngày không hợp lệ"),
  checkIn: z.string().refine(isHHmm, "Giờ vào HH:mm").nullable(),
  checkOut: z.string().refine(isHHmm, "Giờ ra HH:mm").nullable(),
  checkOutNextDay: z.boolean().default(false),
  note: z.string().trim().min(3, "Nhập lý do chỉnh sửa").max(300),
});

/** HR / quản lý chấm công sửa trực tiếp bản ghi công (ghi nhật ký, phương thức MANUAL) */
export const PUT = api(async (req, { ctx }) => {
  requirePerm(ctx, "attendance.update");
  const b = await parseBody(req, schema);
  const emp = await prisma.employee.findUnique({ where: { id: b.employeeId }, select: { id: true, departmentId: true, branchId: true, managerId: true, fullName: true } });
  if (!emp) throw new HttpError(404, "Nhân viên không tồn tại");
  assertEmployeeAccess(ctx, "attendance.update", emp);
  if (ctx.employee?.id === emp.id) throw new HttpError(403, "Không thể tự sửa công của mình – hãy gửi đề nghị điều chỉnh");
  const locked = await prisma.payrollPeriod.findFirst({ where: { status: "LOCKED", startDate: { lte: dbDate(b.workDate) }, endDate: { gte: dbDate(b.workDate) } } });
  if (locked) throw new HttpError(409, `Kỳ lương ${locked.code} đã khoá – không thể sửa công trong kỳ này`);
  const checkInAt = b.checkIn ? vnDateTime(b.workDate, b.checkIn) : null;
  const checkOutAt = b.checkOut ? vnDateTime(b.checkOutNextDay ? addDays(b.workDate, 1) : b.workDate, b.checkOut) : null;
  if (checkInAt && checkOutAt && checkOutAt <= checkInAt) throw new HttpError(400, "Giờ ra phải sau giờ vào (chọn “ra ngày hôm sau” cho ca qua đêm)");
  const before = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId: emp.id, workDate: dbDate(b.workDate) } } });
  const rec = await prisma.attendanceRecord.upsert({
    where: { employeeId_workDate: { employeeId: emp.id, workDate: dbDate(b.workDate) } },
    create: { employeeId: emp.id, workDate: dbDate(b.workDate), checkInAt, checkOutAt, checkInMethod: checkInAt ? "MANUAL" : null, checkOutMethod: checkOutAt ? "MANUAL" : null, note: b.note },
    update: { checkInAt, checkOutAt, checkInMethod: checkInAt ? "MANUAL" : null, checkOutMethod: checkOutAt ? "MANUAL" : null, note: b.note },
  });
  await recomputeRecord(rec.id);
  await audit(ctx, {
    action: "UPDATE",
    entityType: "Attendance",
    entityId: rec.id,
    summary: `Sửa công ${emp.fullName} ngày ${b.workDate}: ${b.note}`,
    changes: { checkIn: { from: before?.checkInAt ?? null, to: checkInAt }, checkOut: { from: before?.checkOutAt ?? null, to: checkOutAt } },
  }, req);
  return { ok: true };
});
