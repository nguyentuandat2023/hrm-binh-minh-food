import type { Prisma } from "@prisma/client";
import { SCOPE_RANK, type Scope } from "./permissions";
import { HttpError } from "./errors";

export interface AuthCtx {
  userId: string;
  email: string;
  sessionId: string;
  roleKeys: string[];
  perms: Record<string, Scope>; // khoá quyền → phạm vi lớn nhất
  employee: { id: string; fullName: string; code: string; departmentId: string | null; branchId: string | null; avatarFileId: string | null } | null;
  /** Các phòng ban user là thành viên hoặc trưởng phòng (kèm phòng ban con) */
  departmentIds: string[];
  totpEnabled: boolean;
  mustChangePassword: boolean;
}

export function mergeScopes(entries: { key: string; scope: Scope }[]): Record<string, Scope> {
  const out: Record<string, Scope> = {};
  for (const { key, scope } of entries) {
    if (!out[key] || SCOPE_RANK[scope] > SCOPE_RANK[out[key]]) out[key] = scope;
  }
  return out;
}

export function can(ctx: Pick<AuthCtx, "perms">, key: string, minScope: Scope = "SELF"): boolean {
  const s = ctx.perms[key];
  return !!s && SCOPE_RANK[s] >= SCOPE_RANK[minScope];
}

export function scopeOf(ctx: Pick<AuthCtx, "perms">, key: string): Scope | null {
  return ctx.perms[key] ?? null;
}

export function requirePerm(ctx: Pick<AuthCtx, "perms">, key: string, minScope: Scope = "SELF"): Scope {
  if (!can(ctx, key, minScope)) throw new HttpError(403, "Bạn không có quyền thực hiện thao tác này");
  return ctx.perms[key];
}

export interface EmployeeRef {
  id: string;
  departmentId: string | null;
  branchId: string | null;
  managerId: string | null;
}

/** Kiểm tra một nhân viên có nằm trong phạm vi dữ liệu của quyền hay không (dùng phía server) */
export function canAccessEmployee(ctx: Pick<AuthCtx, "perms" | "employee" | "departmentIds">, key: string, target: EmployeeRef): boolean {
  const scope = ctx.perms[key];
  if (!scope) return false;
  if (scope === "COMPANY") return true;
  const me = ctx.employee;
  if (!me) return false;
  if (target.id === me.id) return true;
  if (scope === "SELF") return false;
  if (target.managerId === me.id) return true; // TEAM
  if (scope === "TEAM") return false;
  if (target.departmentId && ctx.departmentIds.includes(target.departmentId)) return true; // DEPARTMENT
  if (scope === "DEPARTMENT") return false;
  return !!me.branchId && target.branchId === me.branchId; // BRANCH
}

/** Điều kiện Prisma giới hạn danh sách nhân viên theo phạm vi quyền */
export function employeeScopeWhere(ctx: Pick<AuthCtx, "perms" | "employee" | "departmentIds">, key: string): Prisma.EmployeeWhereInput {
  const scope = ctx.perms[key];
  if (!scope) throw new HttpError(403, "Bạn không có quyền xem dữ liệu này");
  if (scope === "COMPANY") return {};
  const me = ctx.employee;
  if (!me) return { id: "__none__" };
  const or: Prisma.EmployeeWhereInput[] = [{ id: me.id }];
  if (SCOPE_RANK[scope] >= SCOPE_RANK.TEAM) or.push({ managerId: me.id });
  if (SCOPE_RANK[scope] >= SCOPE_RANK.DEPARTMENT && ctx.departmentIds.length) or.push({ departmentId: { in: ctx.departmentIds } });
  if (scope === "BRANCH" && me.branchId) or.push({ branchId: me.branchId });
  return { OR: or };
}

export function assertEmployeeAccess(ctx: AuthCtx, key: string, target: EmployeeRef) {
  if (!canAccessEmployee(ctx, key, target)) throw new HttpError(403, "Bạn không có quyền truy cập dữ liệu của nhân viên này");
}
