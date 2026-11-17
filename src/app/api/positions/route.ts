import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { positionSchema } from "@/lib/validators/org";

export const GET = api(async (_req, { ctx }) => {
  requirePerm(ctx, "org.view");
  return { items: await prisma.position.findMany({ orderBy: [{ level: "desc" }, { name: "asc" }] }) };
});

export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "org.create", "COMPANY");
  const b = await parseBody(req, positionSchema);
  const p = await prisma.position.create({ data: { ...b, departmentId: b.departmentId ?? null } });
  await audit(ctx, { action: "CREATE", entityType: "Position", entityId: p.id, summary: `Tạo chức vụ ${p.name}` }, req);
  return { id: p.id };
});
