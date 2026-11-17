import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { hashPassword } from "@/lib/auth";
import { generateTempPassword } from "@/lib/crypto";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";
import { assertCanAssignRoles } from "@/lib/services/roles";

export const GET = api(async (_req, { ctx }) => {
  requirePerm(ctx, "admin_user.view", "COMPANY");
  const users = await prisma.user.findMany({
    select: { id: true, email: true, isActive: true, totpEnabled: true, lastLoginAt: true, lockedUntil: true, employee: { select: { id: true, fullName: true, code: true } }, roles: { select: { roleId: true, role: { select: { key: true, name: true } } } } },
    orderBy: { email: "asc" },
  });
  return { items: users };
});

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Email không hợp lệ"),
  employeeId: z.string().nullable().optional(),
  roleIds: z.array(z.string()).min(1, "Chọn ít nhất 1 vai trò"),
});

/** Tạo tài khoản: hệ thống sinh mật khẩu tạm (hiển thị 1 lần), bắt buộc đổi khi đăng nhập lần đầu */
export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "admin_user.create", "COMPANY");
  const b = await parseBody(req, schema);
  const roles = await prisma.role.findMany({ where: { id: { in: b.roleIds } } });
  if (roles.length !== b.roleIds.length) throw new HttpError(400, "Vai trò không hợp lệ");
  await assertCanAssignRoles(ctx, b.roleIds);
  if (await prisma.user.findUnique({ where: { email: b.email } })) throw new HttpError(409, "Email đã có tài khoản");
  if (b.employeeId) {
    const e = await prisma.employee.findUnique({ where: { id: b.employeeId }, include: { user: true } });
    if (!e) throw new HttpError(400, "Nhân viên không tồn tại");
    if (e.user) throw new HttpError(409, "Nhân viên này đã có tài khoản");
  }
  const temp = generateTempPassword(14);
  const u = await prisma.user.create({
    data: { email: b.email, employeeId: b.employeeId ?? null, passwordHash: await hashPassword(temp), mustChangePassword: true, roles: { create: b.roleIds.map((roleId) => ({ roleId })) } },
  });
  await audit(ctx, { action: "CREATE", entityType: "User", entityId: u.id, summary: `Tạo tài khoản ${b.email} (${roles.map((r) => r.name).join(", ")})` }, req);
  await notifyUsers([u.id], { type: "WELCOME", title: "Chào mừng bạn đến với hệ thống HRM", body: "Hãy đổi mật khẩu và cập nhật thông tin liên hệ của bạn.", link: "/me" });
  return { id: u.id, tempPassword: temp };
});
