import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/errors";
import { branchSchema } from "@/lib/validators/org";

export const PATCH = api(async (req, { ctx, params }) => {
  const b = await parseBody(req, branchSchema.partial().extend({ isActive: z.boolean().optional() }));
  requirePerm(ctx, b.isActive === false ? "org.delete" : "org.update", "COMPANY");
  const br = await prisma.branch.findUnique({ where: { id: params.id } });
  if (!br) throw new HttpError(404, "Chi nhánh không tồn tại");
  if (b.isActive === false) {
    const n = await prisma.employee.count({ where: { branchId: br.id, deactivatedAt: null, status: { not: "RESIGNED" } } });
    if (n) throw new HttpError(409, `Chi nhánh còn ${n} nhân viên đang làm việc`);
  }
  await prisma.branch.update({ where: { id: br.id }, data: b });
  await audit(ctx, { action: "UPDATE", entityType: "Branch", entityId: br.id, summary: `Cập nhật chi nhánh ${br.name}` }, req);
  return { ok: true };
});
