import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/errors";

const schema = z.object({ employeeIds: z.array(z.string()).min(1).max(500) });

/** Phân bổ nhân viên vào phòng ban */
export const POST = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "employee.update", "COMPANY");
  const { employeeIds } = await parseBody(req, schema);
  const d = await prisma.department.findUnique({ where: { id: params.id } });
  if (!d || !d.isActive) throw new HttpError(404, "Phòng ban không tồn tại hoặc đã ngừng hoạt động");
  const emps = await prisma.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true, code: true, departmentId: true } });
  await prisma.$transaction(async (tx) => {
    for (const e of emps) {
      if (e.departmentId === d.id) continue;
      await tx.employee.update({ where: { id: e.id }, data: { departmentId: d.id } });
      await audit(ctx, { action: "UPDATE", entityType: "Employee", entityId: e.id, summary: `Chuyển ${e.code} sang phòng ${d.name}`, changes: { departmentId: { from: e.departmentId, to: d.id } } }, req, tx);
    }
  });
  return { moved: emps.length };
});
