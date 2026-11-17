// Logic tính ngày nghỉ & số ngày phép thuần – kiểm thử trong tests/leave.test.ts
import { eachDay, yearsBetween, type DateKey } from "./dates";

/** Số ngày nghỉ thực tế: chỉ tính ngày làm việc, không tính ngày lễ; nghỉ nửa ngày = 0.5 */
export function countLeaveDays(
  start: DateKey,
  end: DateKey,
  halfDay: "NONE" | "MORNING" | "AFTERNOON",
  isWorkingDay: (d: DateKey) => boolean,
): number {
  if (end < start) return 0;
  if (halfDay !== "NONE") {
    if (start !== end) throw new Error("Nghỉ nửa ngày chỉ áp dụng cho 1 ngày");
    return isWorkingDay(start) ? 0.5 : 0;
  }
  return eachDay(start, end).filter(isWorkingDay).length;
}

export interface LeavePolicy {
  annualBaseDays: number;
  seniorityStepYears: number;
  seniorityExtraDays: number;
  prorateFirstYear: boolean;
}

/**
 * Số ngày phép năm được hưởng trong `year`.
 * Mặc định: 12 ngày + 1 ngày cho mỗi 5 năm thâm niên; năm đầu tính theo tỷ lệ số tháng làm việc.
 * (Tham chiếu Điều 113–114 BLLĐ 2019 – giá trị có thể cấu hình, cần rà soát trước khi vận hành.)
 */
export function annualEntitlement(startDate: DateKey, year: number, p: LeavePolicy): number {
  const [sy, sm] = startDate.split("-").map(Number);
  if (sy > year) return 0;
  const seniority = yearsBetween(startDate, `${year}-12-31`);
  const extra = Math.floor(seniority / p.seniorityStepYears) * p.seniorityExtraDays;
  if (sy === year && p.prorateFirstYear) {
    const months = 12 - sm + 1;
    return roundHalf((p.annualBaseDays * months) / 12);
  }
  return p.annualBaseDays + extra;
}

export function roundHalf(n: number) {
  return Math.round(n * 2) / 2;
}

export interface BalanceLike {
  entitled: number;
  carriedOver: number;
  adjustment: number;
  used: number;
}

export function available(b: BalanceLike, pendingDays = 0): number {
  return Math.round((b.entitled + b.carriedOver + b.adjustment - b.used - pendingDays) * 100) / 100;
}
