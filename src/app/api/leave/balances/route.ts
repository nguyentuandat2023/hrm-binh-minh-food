import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { assertEmployeeAccess, requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { ensureBalance } from "@/lib/services/leave";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("adjust"),
    employeeId: z.string(),
    leaveTypeId: z.string(),
    year: z.number().int().min(2000).max(2100),
    entitled: z.number().min(0).max(365),
    carriedOver: z.number().min(0).max(365),
    adjustment: z.number().min(-365).max(365),
    reason: z.string().trim().min(3, "Nhập lý do điều chỉnh").max(300),
  }),
  z.object({ action: z.literal("init"), year: z.number().int().min(2000).max(2100) }),
]);

export const POST = api(async (req, { ctx }) => {
  const b = await parseBody(req, schema);
  if (b.action === "init") {
    // Khởi tạo số ngày phép năm cho toàn bộ nhân viên đang làm việc (bỏ qua người đã có)
    requirePerm(ctx, "leave.update", "COMPANY");
    const types = await prisma.leaveType.findMany({ where: { isActive: true, deductsBalance: true } });
    const emps = await prisma.employee.findMany({ where: { deactivatedAt: null, status: { not: "RESIGNED" } }, select: { id: true } });
    let created = 0;
    for (const e of emps) {
      for (const t of types) {
        const exists = await prisma.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: t.id, year: b.year } } });
        if (!exists) {
          await ensureBalance(e.id, t.id, b.year);
          created++;
        }
      }
    }
    await audit(ctx, { action: "CREATE", entityType: "LeaveBalance", summary: `Khởi tạo ${created} số dư phép năm ${b.year}` }, req);
    return { created };
  }
  requirePerm(ctx, "leave.update");
  const e = await prisma.employee.findUnique({ where: { id: b.employeeId }, select: { id: true, departmentId: true, branchId: true, managerId: true, fullName: true } });
  if (!e) throw new HttpError(404, "Nhân viên không tồn tại");
  assertEmployeeAccess(ctx, "leave.update", e);
  const before = await ensureBalance(e.id, b.leaveTypeId, b.year);
  await prisma.leaveBalance.update({ where: { id: before.id }, data: { entitled: b.entitled, carriedOver: b.carriedOver, adjustment: b.adjustment } });
  await audit(ctx, {
    action: "UPDATE",
    entityType: "LeaveBalance",
    entityId: before.id,
    summary: `Điều chỉnh số ngày phép ${b.year} của ${e.fullName}: ${b.reason}`,
    changes: { entitled: { from: before.entitled, to: b.entitled }, carriedOver: { from: before.carriedOver, to: b.carriedOver }, adjustment: { from: before.adjustment, to: b.adjustment } },
  }, req);
  return { ok: true };
});
