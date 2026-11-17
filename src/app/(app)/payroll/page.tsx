import Link from "next/link";
import { Settings2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fmtDateTime, fmtVND } from "@/lib/format";
import { PAYROLL_STATUS } from "@/lib/labels";
import { vnDateKey } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FormDialog } from "@/components/form-dialog";

export const metadata = { title: "Tiền lương" };

export default async function PayrollPage() {
  const ctx = await requirePagePerm("payroll.view");
  const [periods, activeConfig] = await Promise.all([
    prisma.payrollPeriod.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }], include: { config: { select: { version: true } }, records: { select: { grossIncome: true, netPay: true, insuranceEmployer: true } } } }),
    prisma.payrollConfig.findFirst({ where: { status: "ACTIVE", verifiedAt: { not: null } }, orderBy: { effectiveFrom: "desc" } }),
  ]);
  const prevMonth = new Date(Date.UTC(Number(vnDateKey().slice(0, 4)), Number(vnDateKey().slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  return (
    <div>
      <PageHeader
        title="Tiền lương"
        description="Quy trình: Tạo kỳ → Nhập khoản điều chỉnh → Tính lương nháp → Kiểm tra → Duyệt → Khoá & phát hành phiếu lương"
        actions={
          <>
            {can(ctx, "payroll.update") && (
              <Link href="/payroll/config" className={buttonClass("outline")}>
                <Settings2 /> Cấu hình lương
              </Link>
            )}
            {can(ctx, "payroll.create", "COMPANY") && (
              <FormDialog title="Tạo kỳ lương" url="/api/payroll/periods" trigger="Tạo kỳ lương" icon="plus" successMessage="Đã tạo kỳ lương" fields={[{ name: "month", label: "Tháng", type: "month", required: true, defaultValue: prevMonth }]} />
            )}
          </>
        }
      />
      {!activeConfig && (
        <Notice tone="warning" className="mb-4">
          Chưa có cấu hình lương nào được <b>xác minh và kích hoạt</b>. Hệ thống không tự giả định mức thuế/bảo hiểm – kế toán cần kiểm tra các tham số theo quy định hiện hành rồi kích hoạt tại <Link href="/payroll/config" className="underline">Cấu hình lương</Link> trước khi tính lương.
        </Notice>
      )}
      <Card>
        {periods.length === 0 ? (
          <EmptyState title="Chưa có kỳ lương" description="Tạo kỳ lương đầu tiên để bắt đầu." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Kỳ lương</TH>
                <TH>Trạng thái</TH>
                <TH className="text-right">Số người</TH>
                <TH className="text-right">Tổng thu nhập</TH>
                <TH className="text-right">Thực lĩnh</TH>
                <TH className="hidden lg:table-cell">Cấu hình</TH>
                <TH className="hidden md:table-cell">Tính lúc</TH>
              </tr>
            </THead>
            <TBody>
              {periods.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/payroll/${p.id}`} className="font-medium text-primary hover:underline">
                      {p.name}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={PAYROLL_STATUS[p.status].tone}>{PAYROLL_STATUS[p.status].label}</Badge>
                  </TD>
                  <TD className="tabular text-right">{p.records.length}</TD>
                  <TD className="tabular text-right">{fmtVND(p.records.reduce((s, r) => s + r.grossIncome, 0))}</TD>
                  <TD className="tabular text-right">{fmtVND(p.records.reduce((s, r) => s + r.netPay, 0))}</TD>
                  <TD className="hidden lg:table-cell">{p.config ? `v${p.config.version}` : "—"}</TD>
                  <TD className="hidden text-xs md:table-cell">{p.calculatedAt ? fmtDateTime(p.calculatedAt) : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
