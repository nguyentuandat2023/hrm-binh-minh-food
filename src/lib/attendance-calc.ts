// Logic tính công thuần (không truy cập DB) – được kiểm thử tự động trong tests/attendance.test.ts
import { addDays, dayOfWeek, parseHHmm, vnDateTime, type DateKey } from "./dates";

export interface ShiftDef {
  id?: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceLateMinutes: number;
  graceEarlyMinutes: number;
  workdayValue: number;
}

export function isOvernight(shift: Pick<ShiftDef, "startTime" | "endTime">): boolean {
  return parseHHmm(shift.endTime) <= parseHHmm(shift.startTime);
}

/** Khung giờ thực tế của ca trong ngày công `workDate` (ca qua đêm kết thúc vào ngày hôm sau) */
export function shiftWindow(workDate: DateKey, shift: ShiftDef) {
  const start = vnDateTime(workDate, shift.startTime);
  const end = vnDateTime(isOvernight(shift) ? addDays(workDate, 1) : workDate, shift.endTime);
  const spanMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return { start, end, spanMinutes, expectedMinutes: Math.max(1, spanMinutes - shift.breakMinutes) };
}

export type DayStatus =
  | "FULL" // Đủ công
  | "PARTIAL" // Thiếu công (đi muộn/về sớm/thiếu giờ)
  | "MISSING_OUT" // Thiếu giờ ra
  | "MISSING_IN" // Thiếu giờ vào
  | "WORKING" // Đang làm (hôm nay đã vào, chưa ra)
  | "ABSENT" // Chưa chấm công
  | "LEAVE" // Nghỉ phép có lương
  | "HALF_LEAVE" // Nghỉ nửa ngày
  | "UNPAID" // Nghỉ không lương
  | "HOLIDAY" // Nghỉ lễ
  | "OFF" // Ngày nghỉ (không có ca)
  | "FUTURE";

export interface AttendanceResult {
  lateMinutes: number;
  earlyMinutes: number;
  workedMinutes: number;
  workdayValue: number;
}

/**
 * Tính công cho một ngày.
 * - Giờ làm = phần giao giữa [vào, ra] và khung ca; trừ giờ nghỉ giữa ca nếu làm quá nửa khung ca.
 * - Đi muộn/về sớm trong ngưỡng cho phép không bị tính.
 * - Thiếu giờ vào hoặc giờ ra: công = 0 (hoặc 0.5 nếu chính sách HALF) cho tới khi được duyệt điều chỉnh.
 */
export function computeAttendance(
  workDate: DateKey,
  shift: ShiftDef,
  checkIn: Date | null,
  checkOut: Date | null,
  missingPolicy: "ZERO" | "HALF" = "ZERO",
): AttendanceResult {
  const w = shiftWindow(workDate, shift);
  if (!checkIn || !checkOut) {
    const late = checkIn ? Math.max(0, Math.round((checkIn.getTime() - w.start.getTime()) / 60000)) : 0;
    return {
      lateMinutes: late > shift.graceLateMinutes ? late : 0,
      earlyMinutes: 0,
      workedMinutes: 0,
      workdayValue: missingPolicy === "HALF" && (checkIn || checkOut) ? round2(shift.workdayValue / 2) : 0,
    };
  }
  if (checkOut <= checkIn) return { lateMinutes: 0, earlyMinutes: 0, workedMinutes: 0, workdayValue: 0 };
  const late = Math.max(0, Math.round((checkIn.getTime() - w.start.getTime()) / 60000));
  const early = Math.max(0, Math.round((w.end.getTime() - checkOut.getTime()) / 60000));
  const overlapStart = Math.max(checkIn.getTime(), w.start.getTime());
  const overlapEnd = Math.min(checkOut.getTime(), w.end.getTime());
  const overlap = Math.max(0, Math.round((overlapEnd - overlapStart) / 60000));
  const worked = Math.max(0, overlap >= w.spanMinutes / 2 ? overlap - shift.breakMinutes : overlap);
  const lateMinutes = late > shift.graceLateMinutes ? late : 0;
  const earlyMinutes = early > shift.graceEarlyMinutes ? early : 0;
  const value =
    lateMinutes === 0 && earlyMinutes === 0
      ? shift.workdayValue
      : round2(shift.workdayValue * Math.min(1, worked / w.expectedMinutes));
  return { lateMinutes, earlyMinutes, workedMinutes: Math.min(worked, w.expectedMinutes), workdayValue: value };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export interface AssignmentLite {
  shiftId: string | null;
  startDate: DateKey;
  endDate: DateKey | null;
  daysOfWeek: number[];
}

/**
 * Chọn ca cho một ngày. Ưu tiên: phân ca riêng 1 ngày > phân ca theo khoảng (bắt đầu gần nhất) > ca mặc định công ty.
 * Trả về undefined nếu không có ca (ngày nghỉ); null nếu được phân "nghỉ".
 */
export function pickShiftId(
  assignments: AssignmentLite[],
  date: DateKey,
  fallback: { defaultShiftId: string | null; workingDays: number[] },
): string | null {
  const dow = dayOfWeek(date);
  const single = assignments.filter((a) => a.startDate === date && a.endDate === date);
  if (single.length) return single[single.length - 1].shiftId;
  const ranged = assignments
    .filter((a) => a.startDate <= date && (!a.endDate || a.endDate >= date) && !(a.startDate === a.endDate))
    .filter((a) => (a.daysOfWeek.length ? a.daysOfWeek.includes(dow) : fallback.workingDays.includes(dow)))
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  if (ranged.length) return ranged[0].shiftId;
  // Có phân ca theo khoảng bao phủ ngày này nhưng không gồm thứ này → ngày nghỉ theo lịch ca
  const coveredButOff = assignments.some((a) => a.startDate <= date && (!a.endDate || a.endDate >= date) && a.daysOfWeek.length > 0);
  if (coveredButOff) return null;
  return fallback.workingDays.includes(dow) ? fallback.defaultShiftId : null;
}

/**
 * Xác định ngày công khi nhân viên bấm "vào ca" lúc `now`.
 * Nếu hôm qua có ca qua đêm và hiện tại vẫn trong khung ca đó (chưa có bản ghi), tính cho ngày hôm qua.
 */
export function resolveCheckInWorkDate(
  now: Date,
  today: DateKey,
  shiftYesterday: ShiftDef | null,
  hasRecordYesterday: boolean,
): DateKey {
  if (shiftYesterday && isOvernight(shiftYesterday) && !hasRecordYesterday) {
    const y = addDays(today, -1);
    const w = shiftWindow(y, shiftYesterday);
    if (now < w.end) return y;
  }
  return today;
}

export interface DayInput {
  date: DateKey;
  today: DateKey;
  shift: ShiftDef | null;
  holiday: boolean;
  leave: { isPaid: boolean; halfDay: "NONE" | "MORNING" | "AFTERNOON" } | null;
  record: { checkInAt: Date | null; checkOutAt: Date | null; workdayValue: number } | null;
}

/** Trạng thái hiển thị của 1 ô trong bảng công tháng */
export function dayStatus(d: DayInput): DayStatus {
  if (d.holiday && !d.record?.checkInAt) return "HOLIDAY";
  if (d.leave && d.leave.halfDay === "NONE") return d.leave.isPaid ? "LEAVE" : "UNPAID";
  if (d.leave && !d.record?.checkInAt) return "HALF_LEAVE";
  if (!d.shift && !d.record) return "OFF";
  if (d.record) {
    const { checkInAt, checkOutAt } = d.record;
    if (checkInAt && checkOutAt) {
      const target = d.leave ? (d.shift?.workdayValue ?? 1) / 2 : (d.shift?.workdayValue ?? 1);
      return d.record.workdayValue >= target - 0.001 ? "FULL" : "PARTIAL";
    }
    if (checkInAt && !checkOutAt) return d.date >= d.today ? "WORKING" : "MISSING_OUT";
    if (!checkInAt && checkOutAt) return "MISSING_IN";
  }
  if (d.date > d.today) return "FUTURE";
  return d.leave ? "HALF_LEAVE" : "ABSENT";
}

export const DAY_STATUS_META: Record<DayStatus, { label: string; short: string; className: string }> = {
  FULL: { label: "Đủ công", short: "✓", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  PARTIAL: { label: "Thiếu công", short: "½", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  MISSING_OUT: { label: "Thiếu giờ ra", short: "!R", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  MISSING_IN: { label: "Thiếu giờ vào", short: "!V", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
  WORKING: { label: "Đang làm", short: "…", className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
  ABSENT: { label: "Chưa chấm công", short: "✗", className: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300" },
  LEAVE: { label: "Nghỉ phép", short: "P", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  HALF_LEAVE: { label: "Nghỉ nửa ngày", short: "P½", className: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  UNPAID: { label: "Nghỉ không lương", short: "KL", className: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
  HOLIDAY: { label: "Nghỉ lễ", short: "L", className: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300" },
  OFF: { label: "Ngày nghỉ", short: "", className: "bg-transparent text-slate-400" },
  FUTURE: { label: "", short: "", className: "bg-transparent" },
};
