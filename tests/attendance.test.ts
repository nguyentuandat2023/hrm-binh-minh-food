import { describe, expect, it } from "vitest";
import { computeAttendance, dayStatus, isOvernight, pickShiftId, resolveCheckInWorkDate, shiftWindow, type ShiftDef } from "@/lib/attendance-calc";
import { vnDateTime } from "@/lib/dates";

const HC: ShiftDef = { startTime: "08:00", endTime: "17:00", breakMinutes: 60, graceLateMinutes: 5, graceEarlyMinutes: 5, workdayValue: 1 };
const NIGHT: ShiftDef = { startTime: "22:00", endTime: "06:00", breakMinutes: 30, graceLateMinutes: 5, graceEarlyMinutes: 5, workdayValue: 1 };
const D = "2026-11-16"; // Thứ Hai

describe("Ca làm việc", () => {
  it("nhận diện ca qua đêm", () => {
    expect(isOvernight(HC)).toBe(false);
    expect(isOvernight(NIGHT)).toBe(true);
  });
  it("khung ca qua đêm kết thúc vào ngày hôm sau", () => {
    const w = shiftWindow(D, NIGHT);
    expect(w.start.toISOString()).toBe(vnDateTime(D, "22:00").toISOString());
    expect(w.end.toISOString()).toBe(vnDateTime("2026-11-17", "06:00").toISOString());
    expect(w.expectedMinutes).toBe(8 * 60 - 30);
  });
});

describe("Tính công", () => {
  it("đủ công khi vào/ra đúng giờ", () => {
    const r = computeAttendance(D, HC, vnDateTime(D, "07:55"), vnDateTime(D, "17:05"));
    expect(r).toMatchObject({ lateMinutes: 0, earlyMinutes: 0, workdayValue: 1, workedMinutes: 480 });
  });
  it("đi muộn trong ngưỡng cho phép không bị tính", () => {
    expect(computeAttendance(D, HC, vnDateTime(D, "08:04"), vnDateTime(D, "17:00")).lateMinutes).toBe(0);
  });
  it("đi muộn 30 phút → trừ công theo tỷ lệ", () => {
    const r = computeAttendance(D, HC, vnDateTime(D, "08:30"), vnDateTime(D, "17:00"));
    expect(r.lateMinutes).toBe(30);
    expect(r.workedMinutes).toBe(450);
    expect(r.workdayValue).toBeCloseTo(450 / 480, 2);
  });
  it("làm buổi sáng (nửa ngày) → 0.5 công, không trừ nghỉ trưa", () => {
    const r = computeAttendance(D, HC, vnDateTime(D, "08:00"), vnDateTime(D, "12:00"));
    expect(r.workedMinutes).toBe(240);
    expect(r.workdayValue).toBe(0.5);
  });
  it("ca qua đêm: vào 22:00 ra 06:00 hôm sau → đủ công", () => {
    const r = computeAttendance(D, NIGHT, vnDateTime(D, "21:58"), vnDateTime("2026-11-17", "06:02"));
    expect(r.workdayValue).toBe(1);
    expect(r.workedMinutes).toBe(450);
  });
  it("ca qua đêm: về sớm 04:00 → thiếu công", () => {
    const r = computeAttendance(D, NIGHT, vnDateTime(D, "22:00"), vnDateTime("2026-11-17", "04:00"));
    expect(r.earlyMinutes).toBe(120);
    expect(r.workdayValue).toBeLessThan(1);
  });
  it("thiếu giờ ra → 0 công (chính sách ZERO) hoặc 0.5 (HALF)", () => {
    expect(computeAttendance(D, HC, vnDateTime(D, "08:00"), null).workdayValue).toBe(0);
    expect(computeAttendance(D, HC, vnDateTime(D, "08:00"), null, "HALF").workdayValue).toBe(0.5);
  });
  it("giờ ra trước giờ vào → 0 công", () => {
    expect(computeAttendance(D, HC, vnDateTime(D, "17:00"), vnDateTime(D, "08:00")).workdayValue).toBe(0);
  });
});

describe("Xác định ngày công khi chấm vào (ca qua đêm)", () => {
  it("vào lúc 00:30 khi hôm qua có ca đêm chưa chấm → tính cho hôm qua", () => {
    expect(resolveCheckInWorkDate(vnDateTime("2026-11-17", "00:30"), "2026-11-17", NIGHT, false)).toBe("2026-11-16");
  });
  it("hôm qua đã có bản ghi → tính cho hôm nay", () => {
    expect(resolveCheckInWorkDate(vnDateTime("2026-11-17", "00:30"), "2026-11-17", NIGHT, true)).toBe("2026-11-17");
  });
  it("sau khi ca đêm hôm qua kết thúc → hôm nay", () => {
    expect(resolveCheckInWorkDate(vnDateTime("2026-11-17", "07:50"), "2026-11-17", NIGHT, false)).toBe("2026-11-17");
  });
});

describe("Phân ca", () => {
  const fallback = { defaultShiftId: "HC", workingDays: [1, 2, 3, 4, 5] };
  it("không phân ca → ca mặc định vào ngày làm việc, nghỉ cuối tuần", () => {
    expect(pickShiftId([], "2026-11-16", fallback)).toBe("HC");
    expect(pickShiftId([], "2026-11-15", fallback)).toBeNull(); // Chủ nhật
  });
  it("phân ca 1 ngày ưu tiên hơn phân ca theo khoảng", () => {
    const a = [
      { shiftId: "SANG", startDate: "2026-11-01", endDate: null, daysOfWeek: [1, 2, 3, 4, 5, 6] },
      { shiftId: "DEM", startDate: "2026-11-16", endDate: "2026-11-16", daysOfWeek: [] },
    ];
    expect(pickShiftId(a, "2026-11-16", fallback)).toBe("DEM");
    expect(pickShiftId(a, "2026-11-17", fallback)).toBe("SANG");
  });
  it("ca xoay: ngày không nằm trong thứ được phân → nghỉ", () => {
    const a = [{ shiftId: "SANG", startDate: "2026-11-01", endDate: "2026-11-30", daysOfWeek: [1, 3, 5] }];
    expect(pickShiftId(a, "2026-11-17", fallback)).toBeNull(); // Thứ Ba
  });
  it("phân 'nghỉ' (shiftId null) cho 1 ngày", () => {
    expect(pickShiftId([{ shiftId: null, startDate: D, endDate: D, daysOfWeek: [] }], D, fallback)).toBeNull();
  });
});

describe("Trạng thái ô bảng công", () => {
  const base = { date: D, today: "2026-11-20", shift: HC, holiday: false, leave: null, record: null };
  it("vắng không phép", () => expect(dayStatus(base)).toBe("ABSENT"));
  it("nghỉ lễ", () => expect(dayStatus({ ...base, holiday: true })).toBe("HOLIDAY"));
  it("nghỉ phép có lương / không lương", () => {
    expect(dayStatus({ ...base, leave: { isPaid: true, halfDay: "NONE" } })).toBe("LEAVE");
    expect(dayStatus({ ...base, leave: { isPaid: false, halfDay: "NONE" } })).toBe("UNPAID");
  });
  it("thiếu giờ ra ngày đã qua", () => expect(dayStatus({ ...base, record: { checkInAt: new Date(), checkOutAt: null, workdayValue: 0 } })).toBe("MISSING_OUT"));
  it("hôm nay đã vào chưa ra → đang làm", () => expect(dayStatus({ ...base, today: D, record: { checkInAt: new Date(), checkOutAt: null, workdayValue: 0 } })).toBe("WORKING"));
  it("ngày tương lai", () => expect(dayStatus({ ...base, today: "2026-11-10" })).toBe("FUTURE"));
  it("không có ca → ngày nghỉ", () => expect(dayStatus({ ...base, shift: null })).toBe("OFF"));
});
