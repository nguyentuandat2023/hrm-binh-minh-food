import Link from "next/link";
import { FileDown, Plus, Printer } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { employeeListWhere, listSelect } from "@/lib/services/employee";
import { pageParams } from "@/lib/api";
import { selectedBranch } from "@/lib/page-ctx";
import { orgOptions } from "@/lib/options";
import { can } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { EMPLOYEE_STATUS, toOptions } from "@/lib/labels";
import { qs, spGet, type SP } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { Avatar, EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar } from "@/components/filter-bar";
import { ImportDialog } from "./import-dialog";

export const metadata = { title: "Nhân viên" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("employee.view");
  const sp = await searchParams;
  const f = {
    q: spGet(sp, "q"),
    department: spGet(sp, "department"),
    position: spGet(sp, "position"),
    status: spGet(sp, "status"),
    branch: spGet(sp, "branch") || (await selectedBranch(ctx, "employee.view")) || undefined,
    inactive: spGet(sp, "inactive"),
  };
  const { page, size, skip, take } = pageParams({ page: spGet(sp, "page") });
  const where = employeeListWhere(ctx, { q: f.q, departmentId: f.department, positionId: f.position, branchId: f.branch, status: f.status, includeInactive: f.inactive === "1" });
  const [total, items, opts] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({ where, select: listSelect, orderBy: { code: "asc" }, skip, take }),
    orgOptions(),
  ]);
  const query = { q: f.q, department: f.department, position: f.position, status: f.status, branch: spGet(sp, "branch"), inactive: f.inactive };

  return (
    <div>
      <PageHeader
        title="Nhân viên"
        description={`${total} hồ sơ${ctx.perms["employee.view"] !== "COMPANY" ? " trong phạm vi bạn quản lý" : ""}`}
        actions={
          <>
            {can(ctx, "employee.export") && (
              <>
                <a href={`/api/employees/export${qs(query)}`} className={buttonClass("outline")}>
                  <FileDown /> Xuất Excel
                </a>
                <Link href={`/employees/print${qs(query)}`} className={buttonClass("outline")} target="_blank">
                  <Printer /> In / PDF
                </Link>
              </>
            )}
            {can(ctx, "employee.create", "COMPANY") && <ImportDialog />}
            {can(ctx, "employee.create") && (
              <LinkButton href="/employees/new">
                <Plus /> Thêm nhân viên
              </LinkButton>
            )}
          </>
        }
      />
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar
            filters={[
              { name: "q", label: "Tìm kiếm", type: "search", placeholder: "Tên, mã, email, SĐT (có thể gõ không dấu)" },
              { name: "department", label: "Phòng ban", type: "select", options: opts.departments },
              { name: "position", label: "Chức vụ", type: "select", options: opts.positions },
              { name: "status", label: "Trạng thái", type: "select", options: toOptions(EMPLOYEE_STATUS) },
              ...(ctx.perms["employee.view"] === "COMPANY" ? [{ name: "branch", label: "Chi nhánh", type: "select" as const, options: opts.branches }] : []),
              { name: "inactive", label: "Hồ sơ ngừng kích hoạt", type: "select", options: [{ value: "1", label: "Hiển thị" }] },
            ]}
          />
        </div>
        {items.length === 0 ? (
          <EmptyState title="Không tìm thấy nhân viên" description="Thử thay đổi từ khoá hoặc bộ lọc." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Nhân viên</TH>
                <TH>Phòng ban</TH>
                <TH className="hidden md:table-cell">Chức vụ</TH>
                <TH className="hidden lg:table-cell">Chi nhánh</TH>
                <TH className="hidden md:table-cell">Ngày vào làm</TH>
                <TH>Trạng thái</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((e) => (
                <TR key={e.id} className={e.deactivatedAt ? "opacity-60" : undefined}>
                  <TD>
                    <Link href={`/employees/${e.id}`} className="flex items-center gap-3 hover:underline">
                      <Avatar name={e.fullName} fileId={e.avatarFileId} size={34} />
                      <span className="min-w-0">
                        <span className="block font-medium">{e.fullName}</span>
                        <span className="block text-xs text-muted-foreground">
                          {e.code}
                          {e.email ? ` · ${e.email}` : ""}
                        </span>
                      </span>
                    </Link>
                  </TD>
                  <TD>{e.department?.name ?? "—"}</TD>
                  <TD className="hidden md:table-cell">{e.position?.name ?? "—"}</TD>
                  <TD className="hidden lg:table-cell">{e.branch?.name ?? "—"}</TD>
                  <TD className="hidden tabular md:table-cell">{fmtDate(e.startDate)}</TD>
                  <TD>
                    {e.deactivatedAt ? <Badge tone="slate">Ngừng kích hoạt</Badge> : <Badge tone={EMPLOYEE_STATUS[e.status].tone}>{EMPLOYEE_STATUS[e.status].label}</Badge>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} size={size} total={total} baseParams={query} />
      </Card>
    </div>
  );
}
