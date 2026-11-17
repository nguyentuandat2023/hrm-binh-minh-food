import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fmtDate, fmtDateTime, fmtNumber, fmtVND } from "@/lib/format";
import { PAYROLL_STATUS } from "@/lib/labels";
import { spGet, type SP } from "@/lib/utils";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, Notice, PageHeader, Tabs } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton, FormDialog } from "@/components/form-dialog";
import { CalculateButton } from "./calculate-button";

const ADJ_LABEL: Record<string, string> = { BONUS: "Thưởng", COMMISSION: "Hoa hồng", ALLOWANCE: "Phụ cấp khác", DEDUCTION: "Khấu trừ", ADVANCE: "Tạm ứng" };

export default async function PayrollPeriodPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("payroll.view");
  const { id } = await params;
  const tab = spGet(await searchParams, "tab") ?? "records";
  const p = await prisma.payrollPeriod.findUnique({
    where: { id },
    include: {
      config: true,
      records: { include: { employee: { select: { id: true, code: true, fullName: true, department: { select: { name: true } } } } }, orderBy: { employee: { code: "asc" } } },
      adjustments: { include: { employee: { select: { fullName: true, code: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!p) notFound();
  const users = await prisma.user.findMany({ where: { id: { in: [p.calculatedById, p.approvedById, p.lockedById].filter(Boolean) as string[] } }, select: { id: true, email: true } });
  const who = (uid: string | null) => users.find((u) => u.id === uid)?.email ?? "";
  const editable = p.status === "DRAFT" || p.status === "CALCULATED";
  const canCreate = can(ctx, "payroll.create", "COMPANY");
  const canApprove = can(ctx, "payroll.approve", "COMPANY");
  const employees = editable && canCreate ? await prisma.employee.findMany({ where: { salaryProfile: { isNot: null }, startDate: { lte: p.endDate }, OR: [{ endDate: null }, { endDate: { gte: p.startDate } }] }, select: { id: true, fullName: true, code: true }, orderBy: { fullName: "asc" } }) : [];
  const total = (k: "grossIncome" | "netPay" | "insuranceEmployee" | "insuranceEmployer" | "pit") => p.records.reduce((s, r) => s + r[k], 0);

  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: "/payroll", label: "Tiền lương" }}
        title={p.name}
        description={`${fmtDate(p.startDate)} – ${fmtDate(p.endDate)} · công chuẩn tham khảo ${p.standardWorkdays} ngày · cấu hình ${p.config ? `v${p.config.version}` : "chưa gán"}`}
        actions={
          <>
            <Badge tone={PAYROLL_STATUS[p.status].tone} className="px-3 py-1 text-sm">
              {PAYROLL_STATUS[p.status].label}
            </Badge>
            {can(ctx, "payroll.export") && p.records.length > 0 && (
              <>
                <a href={`/api/payroll/periods/${p.id}/export`} className={buttonClass("outline")}>
                  <FileDown /> Xuất bảng lương
                </a>
                {p.status !== "DRAFT" && (
                  <a href={`/api/payroll/periods/${p.id}/export?bank=1`} className={buttonClass("outline")}>
                    <FileDown /> File chuyển khoản
                  </a>
                )}
              </>
            )}
            {editable && canCreate && <CalculateButton periodId={p.id} recalc={p.status === "CALCULATED"} />}
            {p.status === "CALCULATED" && canApprove && (
              <ActionButton url={`/api/payroll/periods/${p.id}`} body={{ action: "approve" }} label="Duyệt bảng lương" variant="default" confirmTitle={`Duyệt ${p.name}?`} confirmMessage="Xác nhận bạn đã kiểm tra bảng lương. Người tính lương không được tự duyệt." successMessage="Đã duyệt bảng lương" />
            )}
            {p.status === "APPROVED" && canApprove && (
              <ActionButton url={`/api/payroll/periods/${p.id}`} body={{ action: "lock" }} label="Khoá & phát hành phiếu lương" variant="default" confirmTitle={`Khoá ${p.name}?`} confirmMessage="Sau khi khoá, bảng lương và dữ liệu chấm công/nghỉ phép trong kỳ không thể thay đổi. Nhân viên sẽ xem được phiếu lương." requireText="KHOA" successMessage="Đã khoá và phát hành phiếu lương" />
            )}
            {(p.status === "CALCULATED" || p.status === "APPROVED") && canCreate && (
              <ActionButton url={`/api/payroll/periods/${p.id}`} body={{ action: "reopen" }} label="Mở lại" confirmTitle="Mở lại kỳ lương về trạng thái nháp?" successMessage="Đã mở lại" />
            )}
            {editable && canCreate && p.records.length === 0 && <ActionButton url={`/api/payroll/periods/${p.id}`} method="DELETE" label="Xoá kỳ" danger confirmTitle={`Xoá ${p.name}?`} successMessage="Đã xoá" />}
          </>
        }
      />
      {p.status === "LOCKED" && <Notice>Kỳ lương đã khoá lúc {fmtDateTime(p.lockedAt)} bởi {who(p.lockedById)}. Mọi thay đổi chấm công, nghỉ phép, ngày lễ trong kỳ đều bị chặn.</Notice>}
      {p.status === "CALCULATED" && <Notice tone="warning">Bảng lương nháp tính lúc {fmtDateTime(p.calculatedAt)} bởi {who(p.calculatedById)}. Hãy kiểm tra từng dòng trước khi duyệt. Nếu sửa chấm công/khoản điều chỉnh, cần tính lại.</Notice>}
      {p.approvedById && <p className="text-xs text-muted-foreground">Duyệt bởi {who(p.approvedById)} lúc {fmtDateTime(p.approvedAt)}</p>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Số người" value={p.records.length} />
        <StatCard label="Tổng thu nhập" value={<span className="text-lg">{fmtVND(total("grossIncome"))}</span>} />
        <StatCard label="BH người LĐ" value={<span className="text-lg">{fmtVND(total("insuranceEmployee"))}</span>} tone="slate" />
        <StatCard label="Thuế TNCN" value={<span className="text-lg">{fmtVND(total("pit"))}</span>} tone="amber" />
        <StatCard label="Thực lĩnh" value={<span className="text-lg">{fmtVND(total("netPay"))}</span>} tone="blue" />
      </div>

      <Tabs
        items={[
          { key: "records", label: `Bảng lương (${p.records.length})`, href: "?tab=records" },
          { key: "adjustments", label: `Thưởng / khấu trừ (${p.adjustments.length})`, href: "?tab=adjustments" },
        ]}
        active={tab}
      />
      {tab === "adjustments" ? (
        <Card>
          <CardHeader
            title="Khoản điều chỉnh trong kỳ"
            description="Thưởng, hoa hồng, phụ cấp khác (cộng vào thu nhập); khấu trừ, tạm ứng (trừ sau thuế)"
            actions={
              editable &&
              canCreate && (
                <FormDialog
                  title="Thêm khoản điều chỉnh"
                  url={`/api/payroll/periods/${p.id}/adjustments`}
                  trigger="Thêm khoản"
                  icon="plus"
                  successMessage="Đã thêm – nhớ tính lại lương"
                  fields={[
                    { name: "employeeId", label: "Nhân viên", type: "select", required: true, options: employees.map((e) => ({ value: e.id, label: `${e.fullName} (${e.code})` })), emptyOption: "— Chọn —" },
                    { name: "type", label: "Loại", type: "select", required: true, options: Object.entries(ADJ_LABEL).map(([value, label]) => ({ value, label })) },
                    { name: "amount", label: "Số tiền (VND)", type: "number", min: 1, step: 1000, required: true },
                    { name: "note", label: "Ghi chú" },
                    { name: "taxable", label: "Tính thuế TNCN (áp dụng cho khoản cộng thêm)", type: "checkbox", defaultValue: true },
                  ]}
                />
              )
            }
          />
          {p.adjustments.length === 0 ? (
            <EmptyState title="Chưa có khoản điều chỉnh" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Nhân viên</TH>
                  <TH>Loại</TH>
                  <TH className="text-right">Số tiền</TH>
                  <TH>Ghi chú</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {p.adjustments.map((a) => (
                  <TR key={a.id}>
                    <TD>{a.employee.fullName}</TD>
                    <TD>
                      <Badge tone={a.type === "DEDUCTION" || a.type === "ADVANCE" ? "red" : "green"}>{ADJ_LABEL[a.type]}</Badge>
                      {!a.taxable && a.type !== "DEDUCTION" && a.type !== "ADVANCE" && <span className="ml-1 text-xs text-muted-foreground">không chịu thuế</span>}
                    </TD>
                    <TD className="tabular text-right">{fmtVND(a.amount)}</TD>
                    <TD>{a.note}</TD>
                    <TD className="text-right">{editable && canCreate && <ActionButton url={`/api/payroll/periods/${p.id}/adjustments?adjId=${a.id}`} method="DELETE" label="Xoá" variant="ghost" danger confirmTitle="Xoá khoản này?" />}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : (
        <Card>
          {p.records.length === 0 ? (
            <EmptyState title="Chưa tính lương" description={editable && canCreate ? "Bấm “Tính lương” để tổng hợp công và tính bảng lương nháp." : undefined} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Nhân viên</TH>
                  <TH className="text-right">Công</TH>
                  <TH className="text-right">Phép+lễ</TH>
                  <TH className="text-right">OT (h)</TH>
                  <TH className="text-right">Tổng thu nhập</TH>
                  <TH className="hidden text-right lg:table-cell">Bảo hiểm</TH>
                  <TH className="hidden text-right lg:table-cell">Thuế TNCN</TH>
                  <TH className="text-right">Thực lĩnh</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {p.records.map((r) => (
                  <TR key={r.id} className={r.netPay < 0 ? "bg-rose-50 dark:bg-rose-950/30" : undefined}>
                    <TD>
                      <span className="font-medium">{r.employee.fullName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {r.employee.code} · {r.employee.department?.name}
                      </span>
                    </TD>
                    <TD className="tabular text-right">
                      {fmtNumber(r.actualWorkdays)}/{fmtNumber(r.standardWorkdays)}
                    </TD>
                    <TD className="tabular text-right">{fmtNumber(r.paidLeaveDays + r.holidayDays)}</TD>
                    <TD className="tabular text-right">{fmtNumber(r.overtimeHours)}</TD>
                    <TD className="tabular text-right">{fmtVND(r.grossIncome)}</TD>
                    <TD className="hidden tabular text-right lg:table-cell">{fmtVND(r.insuranceEmployee)}</TD>
                    <TD className="hidden tabular text-right lg:table-cell">{fmtVND(r.pit)}</TD>
                    <TD className="tabular text-right font-semibold">{fmtVND(r.netPay)}</TD>
                    <TD className="text-right">
                      <Link href={`/payroll/payslip/${r.id}`} className="text-xs text-primary hover:underline">
                        Phiếu lương
                      </Link>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
