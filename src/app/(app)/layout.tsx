import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { buildNav } from "@/lib/nav";
import { AppShell } from "@/components/shell/app-shell";
import { actionableApprovals, selectedBranch } from "@/lib/page-ctx";
import { can } from "@/lib/rbac";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePageAuth();
  const [company, unread, approvals, roles] = await Promise.all([
    getSetting("company"),
    prisma.notification.count({ where: { userId: ctx.userId, readAt: null } }),
    actionableApprovals(ctx),
    prisma.role.findMany({ where: { key: { in: ctx.roleKeys } }, select: { name: true } }),
  ]);
  const companyWide = ctx.perms["dashboard.view"] === "COMPANY" || ctx.perms["employee.view"] === "COMPANY";
  const branches = companyWide ? await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : null;
  const branchId = await selectedBranch(ctx, ctx.perms["dashboard.view"] === "COMPANY" ? "dashboard.view" : "employee.view");
  return (
    <AppShell
      nav={buildNav(ctx, { approvals: approvals.length, unread })}
      user={{ name: ctx.employee?.fullName ?? ctx.email, email: ctx.email, avatarFileId: ctx.employee?.avatarFileId ?? null, roles: roles.map((r) => r.name).join(", ") }}
      company={company.shortName || company.name}
      logoUrl={company.logoFileId ? `/api/logo?v=${company.logoFileId}` : null}
      branches={branches}
      branchId={branchId}
      canSearch={can(ctx, "employee.view", "TEAM")}
      unread={unread}
    >
      {children}
    </AppShell>
  );
}
