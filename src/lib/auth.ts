import "server-only";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { mergeScopes, type AuthCtx } from "./rbac";
import type { Scope } from "./permissions";
import { PRIVILEGED_ROLES } from "./permissions";
import { getSetting } from "./settings";

export const SESSION_COOKIE = "hrm_session";
const BCRYPT_ROUNDS = 12;
let dummyHash: Promise<string> | null = null;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, BCRYPT_ROUNDS);
}

export async function verifyPassword(pw: string, hash: string | null | undefined) {
  // Luôn so sánh để thời gian phản hồi không lộ email có tồn tại hay không
  dummyHash ??= bcrypt.hash("dummy-password-for-timing", BCRYPT_ROUNDS);
  const ok = await bcrypt.compare(pw, hash ?? (await dummyHash));
  return !!hash && ok;
}

export function validatePasswordStrength(pw: string, minLength: number): string | null {
  if (pw.length < minLength) return `Mật khẩu tối thiểu ${minLength} ký tự`;
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return "Mật khẩu cần có chữ hoa, chữ thường và chữ số";
  return null;
}

function ttlHours() {
  const n = Number(process.env.SESSION_TTL_HOURS ?? 12);
  return Number.isFinite(n) && n > 0 ? n : 12;
}

export async function createSession(userId: string, mfaVerified: boolean) {
  const token = randomToken(32);
  const h = await headers();
  const expiresAt = new Date(Date.now() + ttlHours() * 3600_000);
  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      mfaVerified,
      expiresAt,
      ip: clientIp(h),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  jar.delete(SESSION_COOKIE);
}

export function clientIp(h: Headers): string | null {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

type SessionState =
  | { status: "none" }
  | { status: "mfa_pending"; sessionId: string; userId: string; email: string }
  | { status: "ok"; ctx: AuthCtx };

/** Đọc phiên hiện tại (được cache trong 1 request) */
export const getSessionState = cache(async (): Promise<SessionState> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return { status: "none" };
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          employee: { select: { id: true, fullName: true, code: true, departmentId: true, branchId: true, avatarFileId: true, headOf: { select: { id: true } } } },
          roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        },
      },
    },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.isActive) return { status: "none" };
  const user = session.user;
  if (user.totpEnabled && !session.mfaVerified) {
    return { status: "mfa_pending", sessionId: session.id, userId: user.id, email: user.email };
  }
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  const perms = mergeScopes(
    user.roles.flatMap((ur) => ur.role.permissions.map((rp) => ({ key: rp.permission.key, scope: rp.scope as Scope }))),
  );
  const departmentIds = await resolveDepartmentIds(user.employee?.departmentId ?? null, user.employee?.headOf?.id ?? null);
  const emp = user.employee;
  return {
    status: "ok",
    ctx: {
      userId: user.id,
      email: user.email,
      sessionId: session.id,
      roleKeys: user.roles.map((r) => r.role.key),
      perms,
      employee: emp
        ? { id: emp.id, fullName: emp.fullName, code: emp.code, departmentId: emp.departmentId, branchId: emp.branchId, avatarFileId: emp.avatarFileId }
        : null,
      departmentIds,
      totpEnabled: user.totpEnabled,
      mustChangePassword: user.mustChangePassword,
    },
  };
});

/** Phòng ban của user + phòng ban user làm trưởng + toàn bộ phòng ban con */
async function resolveDepartmentIds(memberOf: string | null, headOf: string | null): Promise<string[]> {
  const roots = [memberOf, headOf].filter(Boolean) as string[];
  if (!roots.length) return [];
  const all = await prisma.department.findMany({ select: { id: true, parentId: true } });
  const result = new Set<string>(roots);
  // chỉ lấy phòng ban con của phòng ban user làm trưởng
  if (headOf) {
    const queue = [headOf];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const d of all) if (d.parentId === cur && !result.has(d.id)) (result.add(d.id), queue.push(d.id));
    }
  }
  return [...result];
}

export async function mfaRequiredButMissing(ctx: AuthCtx): Promise<boolean> {
  if (ctx.totpEnabled) return false;
  const sec = await getSetting("security");
  return sec.requireMfaForPrivileged && ctx.roleKeys.some((r) => PRIVILEGED_ROLES.includes(r));
}

/** Dùng trong Server Component: bắt buộc đăng nhập, tự chuyển hướng khi cần */
export async function requirePageAuth(opts: { allowPasswordChange?: boolean; allowMfaSetup?: boolean } = {}): Promise<AuthCtx> {
  const state = await getSessionState();
  if (state.status === "none") redirect("/login");
  if (state.status === "mfa_pending") redirect("/login?step=mfa");
  const ctx = state.ctx;
  if (ctx.mustChangePassword && !opts.allowPasswordChange) redirect("/account/password");
  if (!opts.allowMfaSetup && !opts.allowPasswordChange && (await mfaRequiredButMissing(ctx))) redirect("/account/security?required=1");
  return ctx;
}

/** Dùng trong Server Component: yêu cầu quyền, không đủ quyền thì hiển thị trang 403 */
export async function requirePagePerm(key: string): Promise<AuthCtx> {
  const ctx = await requirePageAuth();
  if (!ctx.perms[key]) redirect("/forbidden");
  return ctx;
}
