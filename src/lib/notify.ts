import { prisma, type Tx } from "./db";
import { canAccessEmployee, mergeScopes, type EmployeeRef } from "./rbac";
import type { Scope } from "./permissions";

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
}

/** Thông báo trong ứng dụng (kênh bắt buộc). dedupeKey giúp job tự động chạy lại không tạo trùng. */
export async function notifyUsers(userIds: string[], n: NotifyInput, tx: Tx = prisma) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (!unique.length) return 0;
  const res = await tx.notification.createMany({
    data: unique.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body, link: n.link, dedupeKey: n.dedupeKey })),
    skipDuplicates: true,
  });
  return res.count;
}

export async function notifyEmployee(employeeId: string, n: NotifyInput, tx: Tx = prisma) {
  const user = await tx.user.findUnique({ where: { employeeId }, select: { id: true, isActive: true } });
  if (user?.isActive) await notifyUsers([user.id], n, tx);
}

interface UserPerms {
  id: string;
  perms: Record<string, Scope>;
  employee: { id: string; fullName: string; code: string; departmentId: string | null; branchId: string | null; avatarFileId: string | null } | null;
  departmentIds: string[];
}

/** Tải toàn bộ user đang hoạt động kèm quyền (phù hợp doanh nghiệp vừa và nhỏ) */
export async function loadUsersWithPerms(tx: Tx = prisma): Promise<UserPerms[]> {
  const [users, depts] = await Promise.all([
    tx.user.findMany({
      where: { isActive: true },
      include: {
        employee: { select: { id: true, fullName: true, code: true, departmentId: true, branchId: true, avatarFileId: true, headOf: { select: { id: true } } } },
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    }),
    tx.department.findMany({ select: { id: true, parentId: true } }),
  ]);
  return users.map((u) => {
    const ids = new Set<string>();
    if (u.employee?.departmentId) ids.add(u.employee.departmentId);
    const head = u.employee?.headOf?.id;
    if (head) {
      ids.add(head);
      const q = [head];
      while (q.length) {
        const cur = q.shift()!;
        for (const d of depts) if (d.parentId === cur && !ids.has(d.id)) (ids.add(d.id), q.push(d.id));
      }
    }
    return {
      id: u.id,
      perms: mergeScopes(u.roles.flatMap((r) => r.role.permissions.map((p) => ({ key: p.permission.key, scope: p.scope as Scope })))),
      employee: u.employee ? { ...u.employee } : null,
      departmentIds: [...ids],
    };
  });
}

/** Những user có quyền `permKey` bao phủ nhân viên `target` (không tính chính nhân viên đó) */
export async function usersWithPermFor(permKey: string, target: EmployeeRef, opts: { minCompany?: boolean } = {}, tx: Tx = prisma) {
  const users = await loadUsersWithPerms(tx);
  return users
    .filter((u) => u.employee?.id !== target.id)
    .filter((u) => (opts.minCompany ? u.perms[permKey] === "COMPANY" : canAccessEmployee(u, permKey, target)))
    .map((u) => u.id);
}

export async function usersWithPerm(permKey: string, tx: Tx = prisma) {
  const users = await loadUsersWithPerms(tx);
  return users.filter((u) => !!u.perms[permKey]).map((u) => u.id);
}
