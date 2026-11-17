import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { audit, diff } from "@/lib/audit";
import { HttpError } from "@/lib/errors";
import { shiftSchema } from "@/lib/validators/attendance";

export const PATCH = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "attendance.update", "COMPANY");
  const b = await parseBody(req, shiftSchema.partial().extend({ isActive: z.boolean().optional() }));
  const s = await prisma.workShift.findUnique({ where: { id: params.id } });
  if (!s) throw new HttpError(404, "Ca không tồn tại");
  await prisma.workShift.update({ where: { id: s.id }, data: b });
  await audit(ctx, { action: "UPDATE", entityType: "WorkShift", entityId: s.id, summary: `Cập nhật ca ${s.name}`, changes: diff(s as never, b as never) }, req);
  return { ok: true };
});
