import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { spGet, type SP } from "@/lib/utils";
import { vnDateKey } from "@/lib/dates";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton, FormDialog } from "@/components/form-dialog";
import { FilterBar } from "@/components/filter-bar";

export const metadata = { title: "Ngày nghỉ lễ" };

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePageAuth();
  if (!can(ctx, "leave.update", "COMPANY") && !can(ctx, "admin_setting.view")) redirect("/forbidden");
  const year = Number(spGet(await searchParams, "year")) || Number(vnDateKey().slice(0, 4));
  const canEdit = can(ctx, "leave.update", "COMPANY");
  const items = await prisma.holiday.findMany({ where: { date: { gte: new Date(`${year}-01-01T00:00:00Z`), lte: new Date(`${year}-12-31T00:00:00Z`) } }, orderBy: { date: "asc" } });
  return (
    <div>
      <PageHeader back={{ href: "/settings", label: "Cài đặt" }} title={`Ngày nghỉ lễ năm ${year}`} />
      <Notice tone="warning" className="mb-4">
        Hệ thống chỉ điền sẵn các ngày lễ dương lịch cố định. Tết Nguyên đán, Giỗ Tổ Hùng Vương, ngày nghỉ liền kề Quốc khánh và lịch hoán đổi ngày làm việc thay đổi theo thông báo hằng năm của Nhà nước – HR cần bổ sung theo văn bản chính thức.
      </Notice>
      <Card>
        <CardHeader
          title="Danh sách ngày lễ"
          description="Ngày lễ không tính vào số ngày nghỉ phép và được tính là ngày nghỉ có lương trong bảng công"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <FilterBar filters={[{ name: "year", label: "Năm", type: "select", options: [year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) })) }]} />
              {canEdit && (
                <FormDialog
                  title="Thêm ngày lễ"
                  url="/api/admin/holidays"
                  trigger="Thêm ngày lễ"
                  icon="plus"
                  fields={[
                    { name: "date", label: "Ngày", type: "date", required: true },
                    { name: "name", label: "Tên ngày lễ", required: true },
                    { name: "isPaid", label: "Nghỉ hưởng nguyên lương", type: "checkbox", defaultValue: true },
                  ]}
                />
              )}
            </div>
          }
        />
        {items.length === 0 ? (
          <EmptyState title="Chưa có ngày lễ trong năm này" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Ngày</TH>
                <TH>Tên</TH>
                <TH>Hưởng lương</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {items.map((h) => (
                <TR key={h.id}>
                  <TD className="tabular">{fmtDate(h.date)}</TD>
                  <TD className="font-medium">{h.name}</TD>
                  <TD>{h.isPaid ? "Có" : "Không"}</TD>
                  <TD className="text-right">{canEdit && <ActionButton url={`/api/admin/holidays?id=${h.id}`} method="DELETE" label="Xoá" variant="ghost" danger confirmTitle={`Xoá ngày lễ ${h.name}?`} />}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
