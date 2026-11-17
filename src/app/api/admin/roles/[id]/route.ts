import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { MODULES } from "@/lib/permissions";

const schema = z.object({
  permissions: z.array(z.object({ key: z.string(), scope: z.enum(["SELF", "TEAM", "DEPARTMENT", "BRANCH", "COMPANY"]) })).max(500),
});

/** Cập nhật ma trận quyền của 1 vai trò (thay thế toàn bộ) */
export const PUT = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "admin_role.update", "COMPANY");
  const role = await prisma.role.findUnique({ where: { id: params.id }, include: { permissions: { include: { permission: true } } } });
  if (!role) throw new HttpError(404, "Vai trò không tồn tại");
  if (role.key === "SUPER_ADMIN") throw new HttpError(400, "Vai trò Super Admin luôn có toàn quyền – không chỉnh sửa");
  if (ctx.roleKeys.includes(role.key) && !ctx.roleKeys.includes("SUPER_ADMIN")) throw new HttpError(403, "Không thể tự sửa quyền của vai trò bạn đang giữ");
  const b = await parseBody(req, schema);
  const perms = await prisma.permission.findMany();
  const byKey = new Map(perms.map((p) => [p.key, p]));
  const companyOnly = new Set(MODULES.filter((m) => m.companyOnly).map((m) => m.key));
  const rows = b.permissions.map((p) => {
    const perm = byKey.get(p.key);
    if (!perm) throw new HttpError(400, `Quyền không tồn tại: ${p.key}`);
    return { roleId: role.id, permissionId: perm.id, scope: companyOnly.has(perm.module) ? ("COMPANY" as const) : p.scope };
  });
  await prisma.$transaction([prisma.rolePermission.deleteMany({ where: { roleId: role.id } }), prisma.rolePermission.createMany({ data: rows })]);
  const before = Object.fromEntries(role.permissions.map((p) => [p.permission.key, p.scope]));
  const after = Object.fromEntries(rows.map((r) => [perms.find((p) => p.id === r.permissionId)!.key, r.scope]));
  const changes: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) if (before[k] !== after[k]) changes[k] = { from: before[k] ?? null, to: after[k] ?? null };
  await audit(ctx, { action: "PERMISSIONS_CHANGED", entityType: "Role", entityId: role.id, summary: `Cập nhật ma trận quyền vai trò ${role.name} (${Object.keys(changes).length} thay đổi)`, changes }, req);
  return { ok: true, changed: Object.keys(changes).length };
});

/** Xoá vai trò tuỳ chỉnh không còn tài khoản sử dụng */
export const DELETE = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "admin_role.update", "COMPANY");
  const role = await prisma.role.findUnique({ where: { id: params.id }, include: { _count: { select: { users: true } } } });
  if (!role) throw new HttpError(404, "Vai trò không tồn tại");
  if (role.isSystem) throw new HttpError(400, "Không xoá vai trò hệ thống");
  if (role._count.users) throw new HttpError(409, `Còn ${role._count.users} tài khoản đang dùng vai trò này`);
  await prisma.role.delete({ where: { id: role.id } });
  await audit(ctx, { action: "DELETE", entityType: "Role", entityId: role.id, summary: `Xoá vai trò ${role.name}` }, req);
  return { ok: true };
});
