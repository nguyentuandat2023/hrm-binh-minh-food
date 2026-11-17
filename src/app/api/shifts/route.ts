import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { shiftSchema } from "@/lib/validators/attendance";

export const GET = api(async (_req, { ctx }) => {
  requirePerm(ctx, "attendance.view");
  return { items: await prisma.workShift.findMany({ orderBy: { startTime: "asc" } }) };
});

export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "attendance.update", "COMPANY");
  const b = await parseBody(req, shiftSchema);
  const s = await prisma.workShift.create({ data: b });
  await audit(ctx, { action: "CREATE", entityType: "WorkShift", entityId: s.id, summary: `Tạo ca ${s.name} ${s.startTime}–${s.endTime}` }, req);
  return { id: s.id };
});
