import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { assertEmployeeAccess } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

const schema = z.object({ status: z.enum(["ACTIVE", "EXPIRED", "TERMINATED"]), note: z.string().trim().max(500).optional() });

/** Cập nhật trạng thái hợp đồng (chấm dứt / hết hạn) */
export const PATCH = api(async (req, { ctx, params }) => {
  const c = await prisma.employmentContract.findUnique({ where: { id: params.id }, include: { employee: { select: { id: true, departmentId: true, branchId: true, managerId: true, fullName: true } } } });
  if (!c) throw new HttpError(404, "Hợp đồng không tồn tại");
  assertEmployeeAccess(ctx, "contract.update", c.employee);
  const b = await parseBody(req, schema);
  await prisma.employmentContract.update({ where: { id: c.id }, data: { status: b.status, note: b.note ?? c.note } });
  await audit(ctx, { action: "UPDATE", entityType: "Employee", entityId: c.employeeId, summary: `Hợp đồng ${c.code} → ${b.status}`, changes: { contractStatus: { from: c.status, to: b.status } } }, req);
  return { ok: true };
});
