import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/crypto";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { assertCanAssignRoles } from "@/lib/services/roles";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("lock") }),
  z.object({ action: z.literal("unlock") }),
  z.object({ action: z.literal("reset_password") }),
  z.object({ action: z.literal("revoke_sessions") }),
  z.object({ action: z.literal("reset_mfa") }),
  z.object({ action: z.literal("set_roles"), roleIds: z.array(z.string()).min(1, "Chọn ít nhất 1 vai trò") }),
]);

async function superAdminCount(excludeUserId?: string) {
  return prisma.user.count({ where: { isActive: true, roles: { some: { role: { key: "SUPER_ADMIN" } } }, ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}) } });
}

export const PATCH = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "admin_user.update", "COMPANY");
  const b = await parseBody(req, schema);
  const user = await prisma.user.findUnique({ where: { id: params.id }, include: { roles: { include: { role: true } } } });
  if (!user) throw new HttpError(404, "Tài khoản không tồn tại");
  const targetIsSuper = user.roles.some((r) => r.role.key === "SUPER_ADMIN");
  const actorIsSuper = ctx.roleKeys.includes("SUPER_ADMIN");
  // Chống leo thang đặc quyền: chỉ Super Admin được thao tác trên tài khoản Super Admin
  if (targetIsSuper && !actorIsSuper) throw new HttpError(403, "Chỉ Super Admin mới quản lý được tài khoản Super Admin");

  switch (b.action) {
    case "lock": {
      if (user.id === ctx.userId) throw new HttpError(400, "Không thể tự khoá tài khoản của mình");
      if (targetIsSuper && (await superAdminCount(user.id)) === 0) throw new HttpError(400, "Không thể khoá Super Admin cuối cùng");
      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { isActive: false } }),
        prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      ]);
      await audit(ctx, { action: "ACCOUNT_LOCKED", entityType: "User", entityId: user.id, summary: `Khoá tài khoản ${user.email}` }, req);
      return { ok: true };
    }
    case "unlock":
      await prisma.user.update({ where: { id: user.id }, data: { isActive: true, lockedUntil: null, failedLoginCount: 0 } });
      await audit(ctx, { action: "ACCOUNT_UNLOCKED", entityType: "User", entityId: user.id, summary: `Mở khoá tài khoản ${user.email}` }, req);
      return { ok: true };
    case "reset_password": {
      const temp = generateTempPassword(14);
      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(temp), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null } }),
        prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      ]);
      await audit(ctx, { action: "PASSWORD_RESET", entityType: "User", entityId: user.id, summary: `Đặt lại mật khẩu cho ${user.email}` }, req);
      return { ok: true, tempPassword: temp };
    }
    case "revoke_sessions": {
      const r = await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(ctx, { action: "SESSIONS_REVOKED", entityType: "User", entityId: user.id, summary: `Thu hồi ${r.count} phiên của ${user.email}` }, req);
      return { ok: true, revoked: r.count };
    }
    case "reset_mfa":
      await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecretEnc: null } });
      await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await audit(ctx, { action: "MFA_RESET", entityType: "User", entityId: user.id, summary: `Đặt lại xác thực hai lớp cho ${user.email}` }, req);
      return { ok: true };
    case "set_roles": {
      const roles = await prisma.role.findMany({ where: { id: { in: b.roleIds } } });
      if (roles.length !== b.roleIds.length) throw new HttpError(400, "Vai trò không hợp lệ");
      const willBeSuper = roles.some((r) => r.key === "SUPER_ADMIN");
      await assertCanAssignRoles(ctx, b.roleIds);
      if (user.id === ctx.userId && !actorIsSuper) throw new HttpError(403, "Không thể tự thay đổi vai trò của mình");
      if (targetIsSuper && !willBeSuper && (await superAdminCount(user.id)) === 0) throw new HttpError(400, "Phải còn ít nhất 1 Super Admin đang hoạt động");
      await prisma.$transaction([
        prisma.userRole.deleteMany({ where: { userId: user.id } }),
        prisma.userRole.createMany({ data: b.roleIds.map((roleId) => ({ userId: user.id, roleId })) }),
      ]);
      await audit(ctx, { action: "ROLES_CHANGED", entityType: "User", entityId: user.id, summary: `Gán vai trò cho ${user.email}: ${roles.map((r) => r.name).join(", ")}`, changes: { roles: { from: user.roles.map((r) => r.role.key), to: roles.map((r) => r.key) } } }, req);
      return { ok: true };
    }
  }
});
