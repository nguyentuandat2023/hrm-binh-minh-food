import Link from "next/link";
import { FileDown } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can, employeeScopeWhere } from "@/lib/rbac";
import { orgOptions } from "@/lib/options";
import { pageParams } from "@/lib/api";
import { fmtDate, fmtVND } from "@/lib/format";
import { ASSET_CATEGORY, ASSET_STATUS, toOptions } from "@/lib/labels";
import { spGet, type SP } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader, Pagination } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar } from "@/components/filter-bar";
import { FormDialog, type FieldDef } from "@/components/form-dialog";
import { AssetHistory } from "./asset-history";

export const metadata = { title: "Tài sản" };

export default async function AssetsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("asset.view");
  const sp = await searchParams;
  const companyWide = ctx.perms["asset.view"] === "COMPANY";
  const q = spGet(sp, "q");
  const where: Prisma.AssetWhereInput = {
    AND: [
      companyWide ? {} : { currentHolder: employeeScopeWhere(ctx, "asset.view") },
      q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { serialNumber: { contains: q, mode: "insensitive" } }, { currentHolder: { fullName: { contains: q, mode: "insensitive" } } }] } : {},
      spGet(sp, "category") ? { category: spGet(sp, "category") as never } : {},
      spGet(sp, "status") ? { status: spGet(sp, "status") as never } : {},
    ],
  };
  const { page, size, skip, take } = pageParams({ page: spGet(sp, "page") });
  const [total, items, opts] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      include: { currentHolder: { select: { id: true, fullName: true, code: true } }, branch: { select: { name: true } }, assignments: { include: { employee: { select: { fullName: true } } }, orderBy: { assignedAt: "desc" }, take: 10 } },
      orderBy: { code: "asc" },
      skip,
      take,
    }),
    orgOptions(),
  ]);
  const canEdit = can(ctx, "asset.update", "COMPANY");
  const fields = (a?: (typeof items)[number]): FieldDef[] => [
    ...(a ? [{ name: "id", label: "", type: "hidden" as const, defaultValue: a.id }] : []),
    { name: "name", label: "Tên tài sản", required: true, full: true, defaultValue: a?.name },
    { name: "category", label: "Loại", type: "select", required: true, options: toOptions(ASSET_CATEGORY), defaultValue: a?.category ?? "LAPTOP" },
    { name: "serialNumber", label: "Số serial", defaultValue: a?.serialNumber },
    { name: "purchaseDate", label: "Ngày mua", type: "date", defaultValue: a?.purchaseDate?.toISOString().slice(0, 10) },
    { name: "purchaseCost", label: "Giá trị (VND)", type: "number", min: 0, step: 1000, defaultValue: a?.purchaseCost },
    { name: "branchId", label: "Chi nhánh", type: "select", options: opts.branches, defaultValue: a?.branchId },
    { name: "condition", label: "Tình trạng", defaultValue: a?.condition ?? "Mới" },
    ...(a && a.status !== "ASSIGNED" ? [{ name: "status", label: "Trạng thái", type: "select" as const, options: toOptions(ASSET_STATUS).filter((o) => o.value !== "ASSIGNED"), defaultValue: a.status, required: true }] : []),
    { name: "note", label: "Ghi chú", type: "textarea", defaultValue: a?.note },
  ];
  return (
    <div>
      <PageHeader
        title="Tài sản công ty"
        description={`${total} tài sản`}
        actions={
          <>
            {can(ctx, "asset.export", "COMPANY") && (
              <a href="/api/assets" className={buttonClass("outline")}>
                <FileDown /> Xuất Excel
              </a>
            )}
            {can(ctx, "asset.create", "COMPANY") && <FormDialog title="Thêm tài sản" url="/api/assets" fields={fields()} trigger="Thêm tài sản" icon="plus" successMessage="Đã thêm tài sản" />}
          </>
        }
      />
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar filters={[{ name: "q", label: "Tìm mã, tên, serial, người dùng", type: "search" }, { name: "category", label: "Loại", type: "select", options: toOptions(ASSET_CATEGORY) }, { name: "status", label: "Tình trạng", type: "select", options: toOptions(ASSET_STATUS) }]} />
        </div>
        {items.length === 0 ? (
          <EmptyState title="Không có tài sản" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Tài sản</TH>
                <TH>Loại</TH>
                <TH className="hidden lg:table-cell">Giá trị</TH>
                <TH>Người sử dụng</TH>
                <TH>Tình trạng</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {items.map((a) => (
                <TR key={a.id}>
                  <TD>
                    <span className="font-medium">{a.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {a.code}
                      {a.serialNumber ? ` · SN ${a.serialNumber}` : ""}
                    </span>
                  </TD>
                  <TD>{ASSET_CATEGORY[a.category]}</TD>
                  <TD className="hidden tabular lg:table-cell">{a.purchaseCost ? fmtVND(a.purchaseCost) : "—"}</TD>
                  <TD>
                    {a.currentHolder ? (
                      <Link href={`/employees/${a.currentHolder.id}`} className="hover:underline">
                        {a.currentHolder.fullName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {a.assignments[0] && !a.assignments[0].returnedAt && <span className="block text-xs text-muted-foreground">từ {fmtDate(a.assignments[0].assignedAt)}</span>}
                  </TD>
                  <TD>
                    <Badge tone={ASSET_STATUS[a.status].tone}>{ASSET_STATUS[a.status].label}</Badge>
                  </TD>
                  <TD className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <AssetHistory code={a.code} name={a.name} rows={a.assignments.map((h) => ({ id: h.id, employee: h.employee.fullName, assignedAt: h.assignedAt.toISOString(), returnedAt: h.returnedAt?.toISOString() ?? null, conditionOut: h.conditionOut, conditionIn: h.conditionIn }))} />
                      {canEdit && a.status === "AVAILABLE" && (
                        <FormDialog
                          title={`Bàn giao ${a.code} – ${a.name}`}
                          url={`/api/assets/${a.id}`}
                          trigger="Bàn giao"
                          triggerVariant="ghost"
                          triggerSize="sm"
                          successMessage="Đã bàn giao – có thể in biên bản trong Lịch sử"
                          fields={[
                            { name: "action", label: "", type: "hidden", defaultValue: "assign" },
                            { name: "employeeId", label: "Nhân viên nhận", type: "select", required: true, options: opts.employees, emptyOption: "— Chọn —" },
                            { name: "conditionOut", label: "Tình trạng khi giao", defaultValue: a.condition ?? "Tốt" },
                            { name: "note", label: "Ghi chú (phụ kiện kèm theo…)", type: "textarea" },
                          ]}
                        />
                      )}
                      {canEdit && a.status === "ASSIGNED" && (
                        <FormDialog
                          title={`Thu hồi ${a.code} – ${a.name}`}
                          url={`/api/assets/${a.id}`}
                          trigger="Thu hồi"
                          triggerVariant="ghost"
                          triggerSize="sm"
                          successMessage="Đã thu hồi tài sản"
                          fields={[
                            { name: "action", label: "", type: "hidden", defaultValue: "return" },
                            { name: "conditionIn", label: "Tình trạng khi thu hồi", required: true, defaultValue: "Tốt" },
                            { name: "toStatus", label: "Trạng thái sau thu hồi", type: "select", required: true, options: toOptions(ASSET_STATUS).filter((o) => o.value !== "ASSIGNED"), defaultValue: "AVAILABLE" },
                            { name: "note", label: "Ghi chú", type: "textarea" },
                          ]}
                        />
                      )}
                      {canEdit && <FormDialog title={`Sửa ${a.code}`} url="/api/assets" fields={fields(a)} trigger="Sửa" triggerVariant="ghost" triggerSize="sm" />}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} size={size} total={total} baseParams={{ q, category: spGet(sp, "category"), status: spGet(sp, "status") }} />
      </Card>
    </div>
  );
}
