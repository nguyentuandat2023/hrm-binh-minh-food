import type { Prisma } from "@prisma/client";
import { isDateKey, vnDateTime, addDays } from "../dates";

export const AUDIT_GROUPS: Record<string, { label: string; actions: string[] }> = {
  login: { label: "Đăng nhập", actions: ["LOGIN", "LOGIN_FAILED", "LOGOUT", "ACCOUNT_LOCKED", "MFA_VERIFIED", "MFA_FAILED"] },
  change: { label: "Chỉnh sửa", actions: ["CREATE", "UPDATE", "DELETE", "DEACTIVATE", "REACTIVATE", "UPLOAD", "IMPORT", "CANCEL", "SETTINGS_CHANGED", "PERMISSIONS_CHANGED", "ROLES_CHANGED", "PASSWORD_RESET", "PASSWORD_CHANGED"] },
  approval: { label: "Phê duyệt", actions: ["APPROVE", "REJECT", "PAYROLL_APPROVED", "PAYROLL_LOCKED"] },
  export: { label: "Xuất dữ liệu", actions: ["EXPORT"] },
};

export function auditWhere(sp: Record<string, string | undefined>): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (sp.group && AUDIT_GROUPS[sp.group]) and.push({ action: { in: AUDIT_GROUPS[sp.group].actions } });
  if (sp.q) and.push({ OR: [{ summary: { contains: sp.q, mode: "insensitive" } }, { user: { email: { contains: sp.q, mode: "insensitive" } } }, { entityType: { contains: sp.q, mode: "insensitive" } }] });
  if (sp.from && isDateKey(sp.from)) and.push({ createdAt: { gte: vnDateTime(sp.from, "00:00") } });
  if (sp.to && isDateKey(sp.to)) and.push({ createdAt: { lt: vnDateTime(addDays(sp.to, 1), "00:00") } });
  return { AND: and };
}
