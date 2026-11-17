import { describe, expect, it } from "vitest";
import { annualEntitlement, available, countLeaveDays } from "@/lib/leave-calc";
import { dayOfWeek } from "@/lib/dates";

const holidays = new Set(["2026-09-02"]);
const officeDay = (d: string) => [1, 2, 3, 4, 5].includes(dayOfWeek(d)) && !holidays.has(d);
const policy = { annualBaseDays: 12, seniorityStepYears: 5, seniorityExtraDays: 1, prorateFirstYear: true };

describe("Đếm ngày nghỉ", () => {
  it("bỏ qua cuối tuần", () => {
    expect(countLeaveDays("2026-11-13", "2026-11-17", "NONE", officeDay)).toBe(3); // T6, T2, T3
  });
  it("bỏ qua ngày lễ", () => {
    expect(countLeaveDays("2026-09-01", "2026-09-03", "NONE", officeDay)).toBe(2);
  });
  it("nghỉ nửa ngày = 0.5; rơi vào ngày nghỉ = 0", () => {
    expect(countLeaveDays("2026-11-16", "2026-11-16", "MORNING", officeDay)).toBe(0.5);
    expect(countLeaveDays("2026-11-15", "2026-11-15", "AFTERNOON", officeDay)).toBe(0);
  });
  it("nghỉ nửa ngày nhiều ngày → lỗi", () => {
    expect(() => countLeaveDays("2026-11-16", "2026-11-17", "MORNING", officeDay)).toThrow();
  });
  it("ngày kết thúc trước ngày bắt đầu → 0", () => {
    expect(countLeaveDays("2026-11-17", "2026-11-16", "NONE", officeDay)).toBe(0);
  });
});

describe("Phép năm", () => {
  it("nhân viên đủ năm: 12 ngày", () => expect(annualEntitlement("2024-03-01", 2026, policy)).toBe(12));
  it("thâm niên 5 năm: +1 ngày; 10 năm: +2 ngày", () => {
    expect(annualEntitlement("2021-01-01", 2026, policy)).toBe(13);
    expect(annualEntitlement("2015-06-01", 2026, policy)).toBe(14);
  });
  it("năm đầu tính theo tỷ lệ tháng (vào tháng 10 → 3/12 × 12 = 3)", () => expect(annualEntitlement("2026-10-01", 2026, policy)).toBe(3));
  it("vào làm sau năm tính → 0", () => expect(annualEntitlement("2027-01-05", 2026, policy)).toBe(0));
  it("số ngày còn lại trừ cả đơn đang chờ", () => expect(available({ entitled: 12, carriedOver: 2, adjustment: -1, used: 4 }, 3)).toBe(6));
});
