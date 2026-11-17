import { prisma, type Tx } from "../db";
import { addDays, dbDate, eachDay, keyOf, vnDateKey, type DateKey } from "../dates";
import { getSetting } from "../settings";
import {
  computeAttendance,
  dayStatus,
  pickShiftId,
  resolveCheckInWorkDate,
  type AssignmentLite,
  type DayStatus,
  type ShiftDef,
} from "../attendance-calc";
import { HttpError } from "../errors";

type ShiftRow = ShiftDef & { id: string; code: string; name: string; color: string };

export interface ScheduleContext {
  shifts: Map<string, ShiftRow>;
  assignments: Map<string, AssignmentLite[]>;
  holidays: Map<DateKey, { name: string; isPaid: boolean }>;
  fallback: { defaultShiftId: string | null; workingDays: number[] };
  missingPolicy: "ZERO" | "HALF";
}

export async function loadScheduleContext(employeeIds: string[], from: DateKey, to: DateKey, tx: Tx = prisma): Promise<ScheduleContext> {
  const [settings, shifts, assigns, holidays] = await Promise.all([
    getSetting("attendance"),
    tx.workShift.findMany(),
    tx.shiftAssignment.findMany({
      where: {
        employeeId: { in: employeeIds },
        startDate: { lte: dbDate(to) },
        OR: [{ endDate: null }, { endDate: { gte: dbDate(from) } }],
      },
      orderBy: { createdAt: "asc" },
    }),
    tx.holiday.findMany({ where: { date: { gte: dbDate(from), lte: dbDate(to) } } }),
  ]);
  const assignments = new Map<string, AssignmentLite[]>();
  for (const a of assigns) {
    const list = assignments.get(a.employeeId) ?? [];
    list.push({ shiftId: a.shiftId, startDate: keyOf(a.startDate)!, endDate: keyOf(a.endDate), daysOfWeek: a.daysOfWeek });
    assignments.set(a.employeeId, list);
  }
  return {
    shifts: new Map(shifts.map((s) => [s.id, s])),
    assignments,
    holidays: new Map(holidays.map((h) => [keyOf(h.date)!, { name: h.name, isPaid: h.isPaid }])),
    fallback: { defaultShiftId: settings.defaultShiftId, workingDays: settings.workingDays },
    missingPolicy: settings.missingCheckoutPolicy,
  };
}

export function shiftFor(ctx: ScheduleContext, employeeId: string, date: DateKey): ShiftRow | null {
  const id = pickShiftId(ctx.assignments.get(employeeId) ?? [], date, ctx.fallback);
  return id ? (ctx.shifts.get(id) ?? null) : null;
}

/** Ngày làm việc của nhân viên = có ca và không phải ngày lễ */
export function isWorkingDayFn(ctx: ScheduleContext, employeeId: string) {
  return (d: DateKey) => !!shiftFor(ctx, employeeId, d) && !ctx.holidays.has(d);
}

export async function recomputeRecord(recordId: string, tx: Tx = prisma) {
  const r = await tx.attendanceRecord.findUniqueOrThrow({ where: { id: recordId } });
  const date = keyOf(r.workDate)!;
  const sctx = await loadScheduleContext([r.employeeId], date, date, tx);
  const shift = (r.shiftId ? sctx.shifts.get(r.shiftId) : null) ?? shiftFor(sctx, r.employeeId, date);
  if (!shift) {
    // Làm ngày nghỉ: chỉ ghi nhận số phút có mặt, không tính công chuẩn (làm thêm cần đơn tăng ca)
    const worked = r.checkInAt && r.checkOutAt ? Math.max(0, Math.round((r.checkOutAt.getTime() - r.checkInAt.getTime()) / 60000)) : 0;
    return tx.attendanceRecord.update({ where: { id: r.id }, data: { lateMinutes: 0, earlyMinutes: 0, workedMinutes: worked, workdayValue: 0 } });
  }
  const res = computeAttendance(date, shift, r.checkInAt, r.checkOutAt, sctx.missingPolicy);
  return tx.attendanceRecord.update({ where: { id: r.id }, data: { ...res, shiftId: shift.id } });
}

export interface PunchInput {
  method: "WEB" | "QR" | "GPS";
  lat?: number | null;
  lng?: number | null;
}

export async function checkIn(employeeId: string, input: PunchInput, now = new Date()) {
  const today = vnDateKey(now);
  const yesterday = addDays(today, -1);
  const sctx = await loadScheduleContext([employeeId], yesterday, today);
  const yRecord = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate: dbDate(yesterday) } } });
  const workDate = resolveCheckInWorkDate(now, today, shiftFor(sctx, employeeId, yesterday), !!yRecord);
  const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate: dbDate(workDate) } } });
  if (existing?.checkInAt) throw new HttpError(409, "Bạn đã chấm công vào cho ngày này");
  const shift = shiftFor(sctx, employeeId, workDate);
  const data = {
    checkInAt: now,
    checkInMethod: input.method,
    checkInLat: input.lat ?? null,
    checkInLng: input.lng ?? null,
    shiftId: shift?.id ?? null,
  };
  const rec = existing
    ? await prisma.attendanceRecord.update({ where: { id: existing.id }, data })
    : await prisma.attendanceRecord.create({ data: { employeeId, workDate: dbDate(workDate), ...data } });
  return recomputeRecord(rec.id);
}

export async function checkOut(employeeId: string, input: PunchInput, now = new Date()) {
  // Tìm bản ghi đang mở (đã vào, chưa ra) trong vòng 20 giờ – xử lý ca qua đêm
  const open = await prisma.attendanceRecord.findFirst({
    where: { employeeId, checkInAt: { gte: new Date(now.getTime() - 20 * 3600_000) }, checkOutAt: null },
    orderBy: { checkInAt: "desc" },
  });
  const data = { checkOutAt: now, checkOutMethod: input.method, checkOutLat: input.lat ?? null, checkOutLng: input.lng ?? null };
  if (open) {
    await prisma.attendanceRecord.update({ where: { id: open.id }, data });
    return recomputeRecord(open.id);
  }
  // Không có giờ vào: ghi nhận giờ ra cho hôm nay (trạng thái "thiếu giờ vào")
  const today = vnDateKey(now);
  const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_workDate: { employeeId, workDate: dbDate(today) } } });
  if (existing?.checkOutAt) throw new HttpError(409, "Bạn đã chấm công ra hôm nay");
  const rec = existing
    ? await prisma.attendanceRecord.update({ where: { id: existing.id }, data })
    : await prisma.attendanceRecord.create({ data: { employeeId, workDate: dbDate(today), ...data } });
  return recomputeRecord(rec.id);
}

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ------------------------- Bảng công tháng -------------------------

export interface TimesheetCell {
  date: DateKey;
  status: DayStatus;
  value: number;
  late: number;
  early: number;
  ot: number;
  checkIn: string | null;
  checkOut: string | null;
  shift: string | null;
  note?: string;
}

export interface TimesheetRow {
  employee: { id: string; code: string; fullName: string; department: string | null };
  cells: TimesheetCell[];
  totals: {
    workdays: number;
    paidLeave: number;
    unpaidLeave: number;
    holidays: number;
    lateCount: number;
    lateMinutes: number;
    earlyMinutes: number;
    absent: number;
    missing: number;
    otMinutes: number;
    workedMinutes: number;
    scheduledDays: number;
  };
}

export async function buildTimesheet(
  employees: { id: string; code: string; fullName: string; department: { name: string } | null }[],
  from: DateKey,
  to: DateKey,
  today = vnDateKey(),
): Promise<TimesheetRow[]> {
  const ids = employees.map((e) => e.id);
  const [sctx, records, leaves, ots] = await Promise.all([
    loadScheduleContext(ids, from, to),
    prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: { gte: dbDate(from), lte: dbDate(to) } } }),
    prisma.leaveRequest.findMany({
      where: { employeeId: { in: ids }, status: "APPROVED", startDate: { lte: dbDate(to) }, endDate: { gte: dbDate(from) } },
      include: { leaveType: { select: { isPaid: true, name: true } } },
    }),
    prisma.overtimeRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", workDate: { gte: dbDate(from), lte: dbDate(to) } } }),
  ]);
  const recMap = new Map(records.map((r) => [`${r.employeeId}|${keyOf(r.workDate)}`, r]));
  const otMap = new Map<string, number>();
  for (const o of ots) {
    const k = `${o.employeeId}|${keyOf(o.workDate)}`;
    otMap.set(k, (otMap.get(k) ?? 0) + o.minutes);
  }
  const days = eachDay(from, to);
  return employees.map((emp) => {
    const totals: TimesheetRow["totals"] = {
      workdays: 0,
      paidLeave: 0,
      unpaidLeave: 0,
      holidays: 0,
      lateCount: 0,
      lateMinutes: 0,
      earlyMinutes: 0,
      absent: 0,
      missing: 0,
      otMinutes: 0,
      workedMinutes: 0,
      scheduledDays: 0,
    };
    const myLeaves = leaves.filter((l) => l.employeeId === emp.id);
    const cells = days.map((date): TimesheetCell => {
      const shift = shiftFor(sctx, emp.id, date);
      const holiday = sctx.holidays.get(date);
      const rec = recMap.get(`${emp.id}|${date}`) ?? null;
      const lv = myLeaves.find((l) => keyOf(l.startDate)! <= date && keyOf(l.endDate)! >= date) ?? null;
      const leave = lv && shift && !holiday ? { isPaid: lv.leaveType.isPaid, halfDay: lv.halfDay } : null;
      const status = dayStatus({
        date,
        today,
        shift,
        holiday: !!holiday && !!shift,
        leave,
        record: rec ? { checkInAt: rec.checkInAt, checkOutAt: rec.checkOutAt, workdayValue: rec.workdayValue } : null,
      });
      const ot = otMap.get(`${emp.id}|${date}`) ?? 0;
      if (shift) totals.scheduledDays += shift.workdayValue;
      if (holiday && shift) totals.holidays += shift.workdayValue;
      if (leave) {
        const portion = leave.halfDay === "NONE" ? shift!.workdayValue : shift!.workdayValue / 2;
        if (leave.isPaid) totals.paidLeave += portion;
        else totals.unpaidLeave += portion;
      }
      if (rec && !(holiday && shift)) {
        totals.workdays += rec.workdayValue;
        totals.workedMinutes += rec.workedMinutes;
        if (rec.lateMinutes > 0) {
          totals.lateCount++;
          totals.lateMinutes += rec.lateMinutes;
        }
        totals.earlyMinutes += rec.earlyMinutes;
      }
      if (status === "ABSENT") totals.absent++;
      if (status === "MISSING_IN" || status === "MISSING_OUT") totals.missing++;
      totals.otMinutes += ot;
      return {
        date,
        status,
        value: rec?.workdayValue ?? 0,
        late: rec?.lateMinutes ?? 0,
        early: rec?.earlyMinutes ?? 0,
        ot,
        checkIn: rec?.checkInAt?.toISOString() ?? null,
        checkOut: rec?.checkOutAt?.toISOString() ?? null,
        shift: shift ? `${shift.name} (${shift.startTime}–${shift.endTime})` : null,
        note: holiday?.name ?? (lv ? lv.leaveType.name : undefined),
      };
    });
    totals.workdays = Math.round(totals.workdays * 100) / 100;
    return { employee: { id: emp.id, code: emp.code, fullName: emp.fullName, department: emp.department?.name ?? null }, cells, totals };
  });
}
