import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { branchSchema } from "@/lib/validators/org";

export const GET = api(async (_req, { ctx }) => {
  requirePerm(ctx, "org.view");
  return { items: await prisma.branch.findMany({ orderBy: { name: "asc" } }) };
});

export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "org.create", "COMPANY");
  const b = await parseBody(req, branchSchema);
  const br = await prisma.branch.create({ data: b });
  await audit(ctx, { action: "CREATE", entityType: "Branch", entityId: br.id, summary: `Tạo chi nhánh ${br.name}` }, req);
  return { id: br.id };
});
