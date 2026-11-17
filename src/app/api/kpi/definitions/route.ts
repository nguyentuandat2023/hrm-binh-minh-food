import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/errors";

const schema = z.object({
  id: z.string().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,30}$/, "Mã 2–30 ký tự"),
  name: z.string().trim().min(2).max(120),
  category: z.enum(["SALES", "TASK", "QUALITY", "PROGRESS", "PERSONAL"]),
  unit: z.string().trim().min(1).max(30),
  direction: z.enum(["HIGHER_BETTER", "LOWER_BETTER"]),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "kpi.create");
  const { id, ...b } = await parseBody(req, schema);
  if (id) {
    if (!(await prisma.kpiDefinition.findUnique({ where: { id } }))) throw new HttpError(404, "KPI không tồn tại");
    await prisma.kpiDefinition.update({ where: { id }, data: b });
    await audit(ctx, { action: "UPDATE", entityType: "KpiDefinition", entityId: id, summary: `Sửa KPI ${b.name}` }, req);
    return { id };
  }
  const d = await prisma.kpiDefinition.create({ data: b });
  await audit(ctx, { action: "CREATE", entityType: "KpiDefinition", entityId: d.id, summary: `Tạo KPI ${b.name}` }, req);
  return { id: d.id };
});
