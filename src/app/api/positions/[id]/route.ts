import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/errors";
import { positionSchema } from "@/lib/validators/org";

export const PATCH = api(async (req, { ctx, params }) => {
  const b = await parseBody(req, positionSchema.partial().extend({ isActive: z.boolean().optional() }));
  requirePerm(ctx, b.isActive === false ? "org.delete" : "org.update", "COMPANY");
  const p = await prisma.position.findUnique({ where: { id: params.id } });
  if (!p) throw new HttpError(404, "Chức vụ không tồn tại");
  await prisma.position.update({ where: { id: p.id }, data: b });
  await audit(ctx, { action: "UPDATE", entityType: "Position", entityId: p.id, summary: `Cập nhật chức vụ ${p.name}` }, req);
  return { ok: true };
});
