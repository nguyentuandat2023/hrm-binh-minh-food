import { prisma } from "../db";
import { HttpError } from "../errors";
import type { AuthCtx } from "../rbac";

/** Người không phải Super Admin không được gán vai trò Super Admin hoặc vai trò có quyền sửa phân quyền */
export async function assertCanAssignRoles(ctx: AuthCtx, roleIds: string[]) {
  if (ctx.roleKeys.includes("SUPER_ADMIN")) return;
  const dangerous = await prisma.role.count({
    where: { id: { in: roleIds }, OR: [{ key: "SUPER_ADMIN" }, { permissions: { some: { permission: { key: "admin_role.update" } } } }] },
  });
  if (dangerous) throw new HttpError(403, "Chỉ Super Admin mới gán được vai trò có quyền quản trị phân quyền");
}
