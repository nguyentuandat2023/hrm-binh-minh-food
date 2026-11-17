import { describe, expect, it } from "vitest";
import { calculatePayroll, payrollParamsSchema, progressiveTax, type PayrollInput, type PayrollParams } from "@/lib/payroll-calc";

// Tham số KIỂM THỬ (không phải giá trị pháp lý) – chỉ để kiểm tra công thức
const params: PayrollParams = payrollParamsSchema.parse({
  hoursPerDay: 8,
  standardWorkdaysMode: "SCHEDULED",
  fixedStandardWorkdays: 26,
  insurance: {
    employee: { bhxh: 0.08, bhyt: 0.015, bhtn: 0.01 },
    employer: { bhxh: 0.175, bhyt: 0.03, bhtn: 0.01 },
    capSocialHealth: 40_000_000,
    capUnemployment: 90_000_000,
    skipIfUnpaidDaysAtLeast: 14,
  },
  pit: {
    personalDeduction: 10_000_000,
    dependentDeduction: 4_000_000,
    brackets: [
      { upTo: 5_000_000, rate: 0.05 },
      { upTo: 10_000_000, rate: 0.1 },
      { upTo: null, rate: 0.2 },
    ],
    overtimePremiumExempt: true,
  },
  overtime: { weekday: 1.5, weekend: 2, holiday: 3 },
});

const base: PayrollInput = {
  payType: "MONTHLY",
  baseSalary: 20_000_000,
  insuranceSalary: null,
  dependents: 0,
  standardWorkdays: 22,
  actualWorkdays: 22,
  paidLeaveDays: 0,
  holidayDays: 0,
  unpaidLeaveDays: 0,
  workedHours: 176,
  overtimeHours: { weekday: 0, weekend: 0, holiday: 0 },
  allowances: [],
  adjustments: [],
};

describe("Thuế luỹ tiến", () => {
  it("tính đúng từng bậc", () => {
    expect(progressiveTax(0, params.pit.brackets)).toBe(0);
    expect(progressiveTax(5_000_000, params.pit.brackets)).toBe(250_000);
    expect(progressiveTax(8_000_000, params.pit.brackets)).toBe(250_000 + 300_000);
    expect(progressiveTax(20_000_000, params.pit.brackets)).toBe(250_000 + 500_000 + 2_000_000);
  });
});

describe("Tính lương", () => {
  it("đủ công: thu nhập = lương cơ bản; BH 10.5%; thuế theo thu nhập tính thuế", () => {
    const r = calculatePayroll(base, params);
    expect(r.grossIncome).toBe(20_000_000);
    expect(r.insuranceEmployee).toBe(2_100_000);
    // TNTT = 20tr − 2.1tr − 10tr = 7.9tr → 250k + 290k
    expect(r.assessableIncome).toBe(7_900_000);
    expect(r.pit).toBe(540_000);
    expect(r.netPay).toBe(20_000_000 - 2_100_000 - 540_000);
  });
  it("thiếu công: lương theo tỷ lệ ngày công; phép + lễ được tính", () => {
    const r = calculatePayroll({ ...base, actualWorkdays: 18, paidLeaveDays: 2, holidayDays: 1 }, params);
    expect(r.lines.find((l) => l.code === "BASE")!.amount).toBe(Math.round((20_000_000 * 21) / 22));
  });
  it("trần đóng BHXH/BHYT áp dụng", () => {
    const r = calculatePayroll({ ...base, baseSalary: 100_000_000, actualWorkdays: 22 }, params);
    expect(r.insuranceEmployee).toBe(Math.round(40_000_000 * 0.08) + Math.round(40_000_000 * 0.015) + Math.round(90_000_000 * 0.01));
  });
  it("nghỉ không lương ≥ 14 ngày → không đóng BH", () => {
    const r = calculatePayroll({ ...base, actualWorkdays: 6, unpaidLeaveDays: 16 }, params);
    expect(r.insuranceEmployee).toBe(0);
  });
  it("người phụ thuộc giảm thuế", () => {
    const a = calculatePayroll(base, params);
    const b = calculatePayroll({ ...base, dependents: 1 }, params);
    expect(b.pit).toBeLessThan(a.pit);
  });
  it("tăng ca: phần chênh lệch được miễn thuế", () => {
    const r = calculatePayroll({ ...base, overtimeHours: { weekday: 10, weekend: 0, holiday: 0 } }, params);
    const hourly = 20_000_000 / 22 / 8;
    expect(r.lines.find((l) => l.code === "OT_WD")!.amount).toBe(Math.round(hourly * 10 * 1.5));
    expect(r.taxableIncome).toBe(r.grossIncome - Math.round(hourly * 10 * 0.5));
  });
  it("phụ cấp không chịu thuế không tính vào thu nhập chịu thuế", () => {
    const r = calculatePayroll({ ...base, allowances: [{ name: "Ăn trưa", amount: 730_000, taxable: false }] }, params);
    expect(r.grossIncome).toBe(20_730_000);
    expect(r.taxableIncome).toBe(20_000_000);
  });
  it("tạm ứng, khấu trừ trừ sau thuế", () => {
    const a = calculatePayroll(base, params);
    const b = calculatePayroll({ ...base, adjustments: [{ type: "ADVANCE", amount: 3_000_000, taxable: false }] }, params);
    expect(b.pit).toBe(a.pit);
    expect(b.netPay).toBe(a.netPay - 3_000_000);
  });
  it("thưởng chịu thuế làm tăng thuế", () => {
    const b = calculatePayroll({ ...base, adjustments: [{ type: "BONUS", amount: 5_000_000, taxable: true }] }, params);
    expect(b.grossIncome).toBe(25_000_000);
    expect(b.pit).toBeGreaterThan(calculatePayroll(base, params).pit);
  });
  it("lương theo giờ", () => {
    const r = calculatePayroll({ ...base, payType: "HOURLY", baseSalary: 50_000, workedHours: 100 }, params);
    expect(r.lines.find((l) => l.code === "BASE")!.amount).toBe(5_000_000);
  });
  it("lương theo ngày công", () => {
    const r = calculatePayroll({ ...base, payType: "DAILY", baseSalary: 400_000, actualWorkdays: 20 }, params);
    expect(r.lines.find((l) => l.code === "BASE")!.amount).toBe(8_000_000);
  });
});

describe("Kiểm tra cấu hình", () => {
  it("bậc thuế cuối phải không giới hạn", () => {
    const bad = { ...params, pit: { ...params.pit, brackets: [{ upTo: 5_000_000, rate: 0.05 }] } };
    expect(payrollParamsSchema.safeParse(bad).success).toBe(false);
  });
  it("các bậc phải tăng dần", () => {
    const bad = { ...params, pit: { ...params.pit, brackets: [{ upTo: 10_000_000, rate: 0.05 }, { upTo: 5_000_000, rate: 0.1 }, { upTo: null, rate: 0.2 }] } };
    expect(payrollParamsSchema.safeParse(bad).success).toBe(false);
  });
});
