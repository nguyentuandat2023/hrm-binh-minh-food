import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth";
import { canAccessEmployee } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { fmtDate, fmtNumber, fmtVND } from "@/lib/format";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Phiếu lương" };

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageAuth();
  const { id } = await params;
  const r = await prisma.payrollRecord.findUnique({
    where: { id },
    include: {
      period: true,
      items: { orderBy: { sort: "asc" } },
      employee: { select: { id: true, code: true, fullName: true, departmentId: true, branchId: true, managerId: true, department: { select: { name: true } }, position: { select: { name: true } } } },
    },
  });
  if (!r) notFound();
  const isOwn = ctx.employee?.id === r.employeeId;
  // Nhân viên chỉ xem phiếu của mình khi kỳ đã khoá; người khác cần quyền xem lương với phạm vi bao phủ nhân viên
  const allowed = isOwn ? !!ctx.perms["payslip.view"] && r.period.status === "LOCKED" : canAccessEmployee(ctx, "payroll.view", r.employee) || (ctx.perms["payslip.view"] !== "SELF" && canAccessEmployee(ctx, "payslip.view", r.employee));
  if (!allowed) redirect("/forbidden");
  if (!isOwn) await audit(ctx, { action: "VIEW_PAYSLIP", entityType: "PayrollRecord", entityId: r.id, summary: `Xem phiếu lương ${r.employee.code} – ${r.period.name}` });
  const company = await getSetting("company");
  const earnings = r.items.filter((i) => i.kind === "EARNING");
  const deductions = r.items.filter((i) => i.kind === "DEDUCTION");
  const info = r.items.filter((i) => i.kind === "EMPLOYER" || i.kind === "INFO");
  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton label="In / Lưu PDF phiếu lương" />
      </div>
      <div className="print-area rounded-xl border border-border bg-white p-6 text-sm text-black shadow-sm">
        <div className="flex justify-between gap-4 border-b border-black/20 pb-3">
          <div>
            <p className="font-semibold">{company.name}</p>
            <p className="text-xs">{company.address}</p>
          </div>
          <p className="text-right text-xs">Mật – chỉ dành cho người nhận</p>
        </div>
        <h1 className="my-4 text-center text-lg font-bold uppercase">Phiếu lương {r.period.name.replace("Lương ", "")}</h1>
        {r.period.status !== "LOCKED" && <p className="mb-3 text-center text-xs font-semibold text-rose-600">BẢN NHÁP – KỲ LƯƠNG CHƯA KHOÁ</p>}
        <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-1">
          <p>
            Họ tên: <b>{r.employee.fullName}</b>
          </p>
          <p>Mã NV: {r.employee.code}</p>
          <p>Phòng ban: {r.employee.department?.name}</p>
          <p>Chức vụ: {r.employee.position?.name}</p>
          <p>
            Ngày công: {fmtNumber(r.actualWorkdays)} / {fmtNumber(r.standardWorkdays)}
          </p>
          <p>Phép + lễ có lương: {fmtNumber(r.paidLeaveDays + r.holidayDays)}</p>
          <p>Tăng ca: {fmtNumber(r.overtimeHours)} giờ</p>
          <p>Lương cơ bản: {fmtVND(r.baseSalary)}</p>
        </div>
        <Section title="Thu nhập" rows={earnings} total={r.grossIncome} totalLabel="Tổng thu nhập" />
        <Section title="Các khoản khấu trừ" rows={deductions} total={r.totalDeductions} totalLabel="Tổng khấu trừ" />
        <div className="my-4 flex items-center justify-between rounded-md border-2 border-black px-4 py-3 text-base font-bold">
          <span>THỰC LĨNH</span>
          <span>{fmtVND(r.netPay)}</span>
        </div>
        <div className="text-xs text-black/70">
          {info.map((i) => (
            <p key={i.id}>
              {i.name}: {fmtVND(i.amount)}
            </p>
          ))}
          <p>Thu nhập chịu thuế: {fmtVND(r.taxableIncome)}</p>
          <p className="mt-2">Kỳ lương {fmtDate(r.period.startDate)} – {fmtDate(r.period.endDate)}. Mọi thắc mắc vui lòng liên hệ bộ phận Kế toán – Nhân sự.</p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, rows, total, totalLabel }: { title: string; rows: { id: string; name: string; amount: number }[]; total: number; totalLabel: string }) {
  return (
    <table className="mb-3 w-full border-collapse">
      <thead>
        <tr>
          <th colSpan={2} className="border-b border-black/30 py-1 text-left">
            {title}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => (
          <tr key={i.id}>
            <td className="py-0.5">{i.name}</td>
            <td className="py-0.5 text-right tabular-nums">{fmtVND(i.amount)}</td>
          </tr>
        ))}
        <tr className="border-t border-black/30 font-semibold">
          <td className="py-1">{totalLabel}</td>
          <td className="py-1 text-right tabular-nums">{fmtVND(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}
