import { prisma } from "@/lib/db";
import { api, fileResponse } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { buildWorkbook, XLSX_MIME } from "@/lib/excel";
import { decrypt } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { PAYROLL_STATUS } from "@/lib/labels";

export const GET = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "payroll.export", "COMPANY");
  const p = await prisma.payrollPeriod.findUnique({
    where: { id: params.id },
    include: { records: { include: { employee: { select: { code: true, fullName: true, department: { select: { name: true } }, salaryProfile: { select: { bankName: true, bankAccountEnc: true } } } }, items: true }, orderBy: { employee: { code: "asc" } } } },
  });
  if (!p) throw new HttpError(404, "Kỳ lương không tồn tại");
  const withBank = req.nextUrl.searchParams.get("bank") === "1";
  const sumItem = (items: { code: string; amount: number }[], codes: string[]) => items.filter((i) => codes.includes(i.code)).reduce((s, i) => s + i.amount, 0);
  const money = "#,##0";
  const buf = await buildWorkbook([
    {
      name: `Luong ${p.code}`,
      title: `BẢNG LƯƠNG ${p.name.toUpperCase()} – ${PAYROLL_STATUS[p.status].label}`,
      columns: [
        { header: "Mã NV", key: "code", width: 9 },
        { header: "Họ tên", key: "name", width: 24 },
        { header: "Phòng ban", key: "dept", width: 20 },
        { header: "Lương cơ bản", key: "base", width: 14, numFmt: money },
        { header: "Công chuẩn", key: "std", width: 9 },
        { header: "Công thực tế", key: "work", width: 9 },
        { header: "Phép + lễ", key: "leave", width: 9 },
        { header: "Lương theo công", key: "basePay", width: 14, numFmt: money },
        { header: "Tăng ca", key: "ot", width: 12, numFmt: money },
        { header: "Phụ cấp", key: "allow", width: 12, numFmt: money },
        { header: "Thưởng/HH", key: "bonus", width: 12, numFmt: money },
        { header: "Tổng thu nhập", key: "gross", width: 14, numFmt: money },
        { header: "BHXH+BHYT+BHTN", key: "ins", width: 14, numFmt: money },
        { header: "Thuế TNCN", key: "pit", width: 12, numFmt: money },
        { header: "Tạm ứng/Khấu trừ", key: "ded", width: 14, numFmt: money },
        { header: "Thực lĩnh", key: "net", width: 14, numFmt: money },
        { header: "BH DN đóng", key: "er", width: 13, numFmt: money },
        ...(withBank ? [{ header: "Ngân hàng", key: "bank", width: 18 }, { header: "Số tài khoản", key: "acc", width: 18 }] : []),
      ],
      rows: p.records.map((r) => ({
        code: r.employee.code,
        name: r.employee.fullName,
        dept: r.employee.department?.name ?? "",
        base: r.baseSalary,
        std: r.standardWorkdays,
        work: r.actualWorkdays,
        leave: r.paidLeaveDays + r.holidayDays,
        basePay: sumItem(r.items, ["BASE"]),
        ot: sumItem(r.items, ["OT_WD", "OT_WE", "OT_HD"]),
        allow: sumItem(r.items, ["ALLOW", "ALLOWANCE"]),
        bonus: sumItem(r.items, ["BONUS", "COMMISSION"]),
        gross: r.grossIncome,
        ins: r.insuranceEmployee,
        pit: r.pit,
        ded: sumItem(r.items, ["DEDUCTION", "ADVANCE"]),
        net: r.netPay,
        er: r.insuranceEmployer,
        ...(withBank ? { bank: r.employee.salaryProfile?.bankName ?? "", acc: decrypt(r.employee.salaryProfile?.bankAccountEnc) ?? "" } : {}),
      })),
    },
  ]);
  await audit(ctx, { action: "EXPORT", entityType: "PayrollPeriod", entityId: p.id, summary: `Xuất bảng lương ${p.name}${withBank ? " (kèm số tài khoản)" : ""}` }, req);
  return fileResponse(buf, `bang-luong-${p.code}${withBank ? "-chuyen-khoan" : ""}.xlsx`, XLSX_MIME);
});
