import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { canAccessEmployee, requirePerm } from "@/lib/rbac";
import { dbDate } from "@/lib/dates";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { assignmentSchema } from "@/lib/validators/attendance";
import { notifyEmployee } from "@/lib/notify";

/** Phân ca cho nhiều nhân viên: cố định theo thứ trong tuần, hoặc 1 ngày (ca xoay), hoặc đánh dấu nghỉ */
export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "attendance.update");
  const b = await parseBody(req, assignmentSchema);
  if (b.endDate && b.endDate < b.startDate) throw new HttpError(400, "Ngày kết thúc phải sau ngày bắt đầu");
  if (b.shiftId && !(await prisma.workShift.findFirst({ where: { id: b.shiftId, isActive: true } }))) throw new HttpError(400, "Ca không hợp lệ");
  const emps = await prisma.employee.findMany({ where: { id: { in: b.employeeIds } }, select: { id: true, departmentId: true, branchId: true, managerId: true } });
  for (const e of emps) if (!canAccessEmployee(ctx, "attendance.update", e)) throw new HttpError(403, "Có nhân viên nằm ngoài phạm vi quản lý của bạn");
  await prisma.$transaction(async (tx) => {
    for (const e of emps) {
      await tx.shiftAssignment.create({
        data: { employeeId: e.id, shiftId: b.shiftId, startDate: dbDate(b.startDate), endDate: b.endDate ? dbDate(b.endDate) : null, daysOfWeek: b.daysOfWeek, note: b.note ?? null },
      });
    }
    await audit(ctx, { action: "CREATE", entityType: "ShiftAssignment", summary: `Phân ca cho ${emps.length} nhân viên từ ${b.startDate}${b.endDate ? ` đến ${b.endDate}` : ""}` }, req, tx);
  });
  for (const e of emps) {
    await notifyEmployee(e.id, { type: "SHIFT", title: "Lịch làm việc được cập nhật", body: `Áp dụng từ ${b.startDate.split("-").reverse().join("/")}`, link: "/me?tab=schedule" });
  }
  return { created: emps.length };
});

export const DELETE = api(async (req, { ctx }) => {
  requirePerm(ctx, "attendance.update");
  const id = req.nextUrl.searchParams.get("id");
  const a = id ? await prisma.shiftAssignment.findUnique({ where: { id }, include: { employee: { select: { id: true, departmentId: true, branchId: true, managerId: true, fullName: true } } } }) : null;
  if (!a) throw new HttpError(404, "Phân ca không tồn tại");
  if (!canAccessEmployee(ctx, "attendance.update", a.employee)) throw new HttpError(403, "Ngoài phạm vi quản lý");
  await prisma.shiftAssignment.delete({ where: { id: a.id } });
  await audit(ctx, { action: "DELETE", entityType: "ShiftAssignment", entityId: a.id, summary: `Xoá phân ca của ${a.employee.fullName}` }, req);
  return { ok: true };
});
