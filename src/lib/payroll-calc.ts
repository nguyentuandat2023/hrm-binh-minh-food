// Bộ tính lương thuần – mọi tham số pháp lý nằm trong cấu hình có phiên bản (payroll_configs.params).
// KHÔNG giả định mức thuế/bảo hiểm: cấu hình phải được kế toán xác minh và kích hoạt trước khi dùng.
import { z } from "zod";

export const payrollParamsSchema = z.object({
  hoursPerDay: z.number().min(1).max(24).default(8),
  standardWorkdaysMode: z.enum(["SCHEDULED", "FIXED"]).default("SCHEDULED"),
  fixedStandardWorkdays: z.number().min(1).max(31).default(26),
  insurance: z.object({
    employee: z.object({ bhxh: z.number().min(0).max(1), bhyt: z.number().min(0).max(1), bhtn: z.number().min(0).max(1) }),
    employer: z.object({ bhxh: z.number().min(0).max(1), bhyt: z.number().min(0).max(1), bhtn: z.number().min(0).max(1) }),
    capSocialHealth: z.number().int().min(0),
    capUnemployment: z.number().int().min(0),
    skipIfUnpaidDaysAtLeast: z.number().min(0).max(31).default(14),
  }),
  pit: z.object({
    personalDeduction: z.number().int().min(0),
    dependentDeduction: z.number().int().min(0),
    brackets: z
      .array(z.object({ upTo: z.number().int().positive().nullable(), rate: z.number().min(0).max(1) }))
      .min(1)
      .refine((b) => b[b.length - 1].upTo === null, "Bậc cuối phải không giới hạn (upTo = null)")
      .refine((b) => b.slice(0, -1).every((x, i, arr) => x.upTo !== null && (i === 0 || x.upTo > (arr[i - 1].upTo ?? 0))), "Các bậc phải tăng dần"),
    overtimePremiumExempt: z.boolean().default(true),
  }),
  overtime: z.object({ weekday: z.number().min(1).max(5), weekend: z.number().min(1).max(5), holiday: z.number().min(1).max(5) }),
});
export type PayrollParams = z.infer<typeof payrollParamsSchema>;

export interface PayrollInput {
  payType: "MONTHLY" | "DAILY" | "HOURLY";
  baseSalary: number;
  insuranceSalary: number | null;
  dependents: number;
  standardWorkdays: number;
  actualWorkdays: number;
  paidLeaveDays: number;
  holidayDays: number;
  unpaidLeaveDays: number;
  workedHours: number;
  overtimeHours: { weekday: number; weekend: number; holiday: number };
  allowances: { name: string; amount: number; taxable: boolean }[];
  adjustments: { type: "BONUS" | "COMMISSION" | "ALLOWANCE" | "DEDUCTION" | "ADVANCE"; amount: number; taxable: boolean; note?: string | null }[];
}

export interface PayrollLine {
  code: string;
  name: string;
  kind: "EARNING" | "DEDUCTION" | "EMPLOYER" | "INFO";
  amount: number;
  taxable: boolean;
}

export interface PayrollOutput {
  lines: PayrollLine[];
  grossIncome: number;
  taxableIncome: number;
  assessableIncome: number;
  insuranceEmployee: number;
  insuranceEmployer: number;
  pit: number;
  totalDeductions: number;
  netPay: number;
}

const r = (n: number) => Math.round(n);

/** Thuế TNCN luỹ tiến từng phần theo bậc cấu hình */
export function progressiveTax(assessable: number, brackets: PayrollParams["pit"]["brackets"]): number {
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upTo ?? Infinity;
    if (assessable <= lower) break;
    tax += (Math.min(assessable, upper) - lower) * b.rate;
    lower = upper;
  }
  return r(tax);
}

export function calculatePayroll(input: PayrollInput, params: PayrollParams): PayrollOutput {
  const lines: PayrollLine[] = [];
  const std = Math.max(0.5, input.standardWorkdays);
  const payableDays = input.actualWorkdays + input.paidLeaveDays + input.holidayDays;

  let basePay = 0;
  let hourlyRate = 0;
  if (input.payType === "MONTHLY") {
    basePay = (input.baseSalary * Math.min(payableDays, std)) / std;
    hourlyRate = input.baseSalary / std / params.hoursPerDay;
  } else if (input.payType === "DAILY") {
    basePay = input.baseSalary * payableDays;
    hourlyRate = input.baseSalary / params.hoursPerDay;
  } else {
    basePay = input.baseSalary * (input.workedHours + (input.paidLeaveDays + input.holidayDays) * params.hoursPerDay);
    hourlyRate = input.baseSalary;
  }
  lines.push({ code: "BASE", name: "Lương theo ngày công", kind: "EARNING", amount: r(basePay), taxable: true });

  let otTotal = 0;
  let otExempt = 0;
  const ot = [
    ["OT_WD", "Tăng ca ngày thường", input.overtimeHours.weekday, params.overtime.weekday],
    ["OT_WE", "Tăng ca ngày nghỉ tuần", input.overtimeHours.weekend, params.overtime.weekend],
    ["OT_HD", "Tăng ca ngày lễ", input.overtimeHours.holiday, params.overtime.holiday],
  ] as const;
  for (const [code, name, hours, mult] of ot) {
    if (hours <= 0) continue;
    const amount = r(hourlyRate * hours * mult);
    otTotal += amount;
    if (params.pit.overtimePremiumExempt) otExempt += r(hourlyRate * hours * (mult - 1));
    lines.push({ code, name: `${name} (${hours}h × ${mult})`, kind: "EARNING", amount, taxable: true });
  }

  let nonTaxable = otExempt;
  let allowanceTotal = 0;
  for (const a of input.allowances) {
    allowanceTotal += a.amount;
    if (!a.taxable) nonTaxable += a.amount;
    lines.push({ code: "ALLOW", name: `Phụ cấp: ${a.name}`, kind: "EARNING", amount: r(a.amount), taxable: a.taxable });
  }
  let extraEarnings = 0;
  let postTaxDeductions = 0;
  const ADJ_LABEL = { BONUS: "Thưởng", COMMISSION: "Hoa hồng", ALLOWANCE: "Phụ cấp khác", DEDUCTION: "Khấu trừ", ADVANCE: "Tạm ứng" } as const;
  for (const a of input.adjustments) {
    const name = `${ADJ_LABEL[a.type]}${a.note ? `: ${a.note}` : ""}`;
    if (a.type === "DEDUCTION" || a.type === "ADVANCE") {
      postTaxDeductions += a.amount;
      lines.push({ code: a.type, name, kind: "DEDUCTION", amount: r(a.amount), taxable: false });
    } else {
      extraEarnings += a.amount;
      if (!a.taxable) nonTaxable += a.amount;
      lines.push({ code: a.type, name, kind: "EARNING", amount: r(a.amount), taxable: a.taxable });
    }
  }

  const gross = r(basePay + otTotal + allowanceTotal + extraEarnings);

  // Bảo hiểm bắt buộc
  const ins = params.insurance;
  const skipIns = ins.skipIfUnpaidDaysAtLeast > 0 && input.unpaidLeaveDays >= ins.skipIfUnpaidDaysAtLeast;
  const insBase = input.insuranceSalary ?? input.baseSalary;
  const baseSH = skipIns ? 0 : Math.min(insBase, ins.capSocialHealth || Infinity);
  const baseU = skipIns ? 0 : Math.min(insBase, ins.capUnemployment || Infinity);
  const eBhxh = r(baseSH * ins.employee.bhxh);
  const eBhyt = r(baseSH * ins.employee.bhyt);
  const eBhtn = r(baseU * ins.employee.bhtn);
  const insEmp = eBhxh + eBhyt + eBhtn;
  const insEr = r(baseSH * ins.employer.bhxh) + r(baseSH * ins.employer.bhyt) + r(baseU * ins.employer.bhtn);
  if (insEmp > 0) {
    lines.push({ code: "BHXH", name: `BHXH (${(ins.employee.bhxh * 100).toFixed(1)}%)`, kind: "DEDUCTION", amount: eBhxh, taxable: false });
    lines.push({ code: "BHYT", name: `BHYT (${(ins.employee.bhyt * 100).toFixed(1)}%)`, kind: "DEDUCTION", amount: eBhyt, taxable: false });
    lines.push({ code: "BHTN", name: `BHTN (${(ins.employee.bhtn * 100).toFixed(1)}%)`, kind: "DEDUCTION", amount: eBhtn, taxable: false });
  }

  // Thuế TNCN
  const taxable = Math.max(0, gross - nonTaxable);
  const familyDeduction = params.pit.personalDeduction + input.dependents * params.pit.dependentDeduction;
  const assessable = Math.max(0, taxable - insEmp - familyDeduction);
  const pit = progressiveTax(assessable, params.pit.brackets);
  if (pit > 0) lines.push({ code: "PIT", name: "Thuế TNCN", kind: "DEDUCTION", amount: pit, taxable: false });

  lines.push({ code: "ER_INS", name: "BH doanh nghiệp đóng", kind: "EMPLOYER", amount: insEr, taxable: false });
  lines.push({ code: "FAMILY_DED", name: `Giảm trừ gia cảnh (${input.dependents} NPT)`, kind: "INFO", amount: familyDeduction, taxable: false });

  const totalDeductions = insEmp + pit + r(postTaxDeductions);
  return {
    lines,
    grossIncome: gross,
    taxableIncome: taxable,
    assessableIncome: assessable,
    insuranceEmployee: insEmp,
    insuranceEmployer: insEr,
    pit,
    totalDeductions,
    netPay: gross - totalDeductions,
  };
}
