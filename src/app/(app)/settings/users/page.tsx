import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fmtDateTime, unaccent } from "@/lib/format";
import { spGet, type SP } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar } from "@/components/filter-bar";
import { CreateUserDialog, UserActions } from "./user-client";

export const metadata = { title: "Tài khoản" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("admin_user.view");
  const sp = await searchParams;
  const q = unaccent(spGet(sp, "q") ?? "").toLowerCase();
  const roleFilter = spGet(sp, "role");
  const [users, roles, freeEmployees] = await Promise.all([
    prisma.user.findMany({
      where: roleFilter ? { roles: { some: { roleId: roleFilter } } } : undefined,
      select: { id: true, email: true, isActive: true, totpEnabled: true, lastLoginAt: true, lockedUntil: true, mustChangePassword: true, employee: { select: { id: true, fullName: true, code: true } }, roles: { select: { roleId: true, role: { select: { key: true, name: true } } } } },
      orderBy: { email: "asc" },
    }),
    prisma.role.findMany({ orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { user: null, deactivatedAt: null, status: { not: "RESIGNED" } }, select: { id: true, fullName: true, code: true, email: true }, orderBy: { fullName: "asc" } }),
  ]);
  const list = q ? users.filter((u) => unaccent(`${u.email} ${u.employee?.fullName ?? ""} ${u.employee?.code ?? ""}`).toLowerCase().includes(q)) : users;
  const canEdit = can(ctx, "admin_user.update");
  const isSuper = ctx.roleKeys.includes("SUPER_ADMIN");
  const roleOpts = roles.map((r) => ({ value: r.id, label: r.name, key: r.key }));
  return (
    <div>
      <PageHeader
        back={{ href: "/settings", label: "Cài đặt" }}
        title="Tài khoản người dùng"
        description={`${users.length} tài khoản · ${freeEmployees.length} nhân viên chưa có tài khoản`}
        actions={can(ctx, "admin_user.create") && <CreateUserDialog roles={roleOpts.filter((r) => isSuper || r.key !== "SUPER_ADMIN")} employees={freeEmployees.map((e) => ({ value: e.id, label: `${e.fullName} (${e.code})`, email: e.email }))} />}
      />
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar filters={[{ name: "q", label: "Tìm email, tên", type: "search" }, { name: "role", label: "Vai trò", type: "select", options: roleOpts }]} />
        </div>
        {list.length === 0 ? (
          <EmptyState title="Không có tài khoản" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Tài khoản</TH>
                <TH>Vai trò</TH>
                <TH className="hidden md:table-cell">Đăng nhập gần nhất</TH>
                <TH>Trạng thái</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {list.map((u) => {
                const targetSuper = u.roles.some((r) => r.role.key === "SUPER_ADMIN");
                return (
                  <TR key={u.id}>
                    <TD>
                      <span className="font-medium">{u.email}</span>
                      {u.employee ? (
                        <Link href={`/employees/${u.employee.id}`} className="block text-xs text-muted-foreground hover:underline">
                          {u.employee.fullName} · {u.employee.code}
                        </Link>
                      ) : (
                        <span className="block text-xs text-muted-foreground">Không gắn hồ sơ nhân viên</span>
                      )}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r.roleId} tone={r.role.key === "SUPER_ADMIN" ? "red" : "primary"}>
                            {r.role.name}
                          </Badge>
                        ))}
                      </div>
                    </TD>
                    <TD className="hidden text-xs md:table-cell">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Chưa đăng nhập"}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {u.isActive ? <Badge tone="green">Hoạt động</Badge> : <Badge tone="red">Đã khoá</Badge>}
                        {u.lockedUntil && u.lockedUntil > new Date() && <Badge tone="amber">Tạm khoá</Badge>}
                        {u.totpEnabled && <Badge tone="blue">2FA</Badge>}
                        {u.mustChangePassword && <Badge tone="slate">Chờ đổi MK</Badge>}
                      </div>
                    </TD>
                    <TD className="text-right">
                      {canEdit && (isSuper || !targetSuper) && (
                        <UserActions user={{ id: u.id, email: u.email, isActive: u.isActive, totpEnabled: u.totpEnabled, roleIds: u.roles.map((r) => r.roleId) }} roles={roleOpts.filter((r) => isSuper || r.key !== "SUPER_ADMIN")} isSelf={u.id === ctx.userId} />
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
