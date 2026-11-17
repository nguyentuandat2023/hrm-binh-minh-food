import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/errors";
import { deptSchema } from "@/lib/validators/org";

export const GET = api(async (_req, { ctx }) => {
  requirePerm(ctx, "org.view");
  const items = await prisma.department.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { head: { select: { id: true, fullName: true } }, branch: { select: { name: true } }, _count: { select: { employees: { where: { deactivatedAt: null, status: { not: "RESIGNED" } } } } } },
  });
  return { items };
});

export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "org.create", "COMPANY");
  const b = await parseBody(req, deptSchema);
  if (b.headId) {
    const taken = await prisma.department.findUnique({ where: { headId: b.headId }, select: { name: true } });
    if (taken) throw new HttpError(409, `Nhân viên này đang là trưởng phòng ${taken.name}`);
  }
  const d = await prisma.department.create({ data: { ...b, description: b.description ?? null, parentId: b.parentId ?? null, branchId: b.branchId ?? null, headId: b.headId ?? null } });
  await audit(ctx, { action: "CREATE", entityType: "Department", entityId: d.id, summary: `Tạo phòng ban ${d.code} – ${d.name}` }, req);
  return { id: d.id };
});
