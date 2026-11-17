import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { HttpError } from "@/lib/errors";

const schema = z.object({
  id: z.string().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{2,20}$/, "Mã 2–20 ký tự"),
  name: z.string().trim().min(2).max(100),
  isPaid: z.boolean(),
  deductsBalance: z.boolean(),
  defaultQuota: z.number().min(0).max(365),
  requiresAttachment: z.boolean(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb"),
  isActive: z.boolean().default(true),
});

export const GET = api(async (_req, { ctx }) => {
  requirePerm(ctx, "leave.view");
  return { items: await prisma.leaveType.findMany({ orderBy: { name: "asc" } }) };
});

/** Tạo mới hoặc cập nhật (có id) loại nghỉ */
export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "leave.update", "COMPANY");
  const { id, ...b } = await parseBody(req, schema);
  if (id) {
    const t = await prisma.leaveType.findUnique({ where: { id } });
    if (!t) throw new HttpError(404, "Loại nghỉ không tồn tại");
    if (t.code === "ANNUAL" && b.code !== "ANNUAL") throw new HttpError(400, "Không đổi mã của loại phép năm (ANNUAL)");
    await prisma.leaveType.update({ where: { id }, data: b });
    await audit(ctx, { action: "UPDATE", entityType: "LeaveType", entityId: id, summary: `Cập nhật loại nghỉ ${b.name}` }, req);
    return { id };
  }
  const t = await prisma.leaveType.create({ data: b });
  await audit(ctx, { action: "CREATE", entityType: "LeaveType", entityId: t.id, summary: `Tạo loại nghỉ ${b.name}` }, req);
  return { id: t.id };
});
