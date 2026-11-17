import { FileDown } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { pageParams } from "@/lib/api";
import { auditWhere, AUDIT_GROUPS } from "@/lib/services/audit-query";
import { fmtDateTime } from "@/lib/format";
import { qs, spGet, type SP } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar } from "@/components/filter-bar";

export const metadata = { title: "Nhật ký hệ thống" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("admin_audit.view");
  const sp = await searchParams;
  const f = { q: spGet(sp, "q"), group: spGet(sp, "group"), from: spGet(sp, "from"), to: spGet(sp, "to") };
  const where = auditWhere(f);
  const { page, size, skip, take } = pageParams({ page: spGet(sp, "page") }, 50);
  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, include: { user: { select: { email: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  const tone = (a: string) => (a.includes("FAILED") || a.includes("LOCKED") || a === "REJECT" || a === "DEACTIVATE" || a === "DELETE" ? "red" : a === "EXPORT" ? "violet" : a === "APPROVE" || a.startsWith("PAYROLL") ? "green" : a.startsWith("LOGIN") || a === "LOGOUT" ? "blue" : "default");
  return (
    <div>
      <PageHeader
        back={{ href: "/settings", label: "Cài đặt" }}
        title="Nhật ký hệ thống"
        description="Ghi nhận người thực hiện, thời gian, địa chỉ IP. Giá trị nhạy cảm (lương, CCCD, tài khoản) không được ghi vào nhật ký."
        actions={
          can(ctx, "admin_audit.export") && (
            <a href={`/api/admin/audit/export${qs(f)}`} className={buttonClass("outline")}>
              <FileDown /> Xuất Excel
            </a>
          )
        }
      />
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar
            filters={[
              { name: "q", label: "Tìm nội dung, email", type: "search" },
              { name: "group", label: "Loại", type: "select", options: Object.entries(AUDIT_GROUPS).map(([k, v]) => ({ value: k, label: v.label })) },
              { name: "from", label: "Từ", type: "date" },
              { name: "to", label: "Đến", type: "date" },
            ]}
          />
        </div>
        {items.length === 0 ? (
          <EmptyState title="Không có bản ghi" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Thời gian</TH>
                <TH>Người thực hiện</TH>
                <TH>Hành động</TH>
                <TH>Nội dung</TH>
                <TH className="hidden lg:table-cell">IP</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap text-xs tabular">{fmtDateTime(l.createdAt)}</TD>
                  <TD className="text-xs">{l.user?.email ?? "Hệ thống / ẩn danh"}</TD>
                  <TD>
                    <Badge tone={tone(l.action) as never}>{l.action}</Badge>
                  </TD>
                  <TD className="max-w-xl text-sm">
                    {l.summary}
                    {l.entityType && <span className="block text-xs text-muted-foreground">{l.entityType}</span>}
                  </TD>
                  <TD className="hidden text-xs lg:table-cell">{l.ip}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} size={size} total={total} baseParams={f} />
      </Card>
    </div>
  );
}
