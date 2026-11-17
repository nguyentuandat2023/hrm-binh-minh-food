// Nhân viên gửi đề nghị điều chỉnh công hoặc đăng ký tăng ca → tạo yêu cầu phê duyệt
import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { addDays, dayOfWeek, dbDate, isDateKey, isHHmm, monthRange, vnDateKey, vnDateTime } from "@/lib/dates";
import { HttpError } from "@/lib/errors";
import { getSetting } from "@/lib/settings";
import { createApproval, notifyApprovers } from "@/lib/services/approval";
import { audit } from "@/lib/audit";

const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ADJUSTMENT"),
    workDate: z.string().refine(isDateKey, "Ngày không hợp lệ"),
    checkIn: z.string().refine(isHHmm, "Giờ vào HH:mm").nullable().optional(),
    checkOut: z.string().refine(isHHmm, "Giờ ra HH:mm").nullable().optional(),
    checkOutNextDay: z.boolean().default(false),
    reason: z.string().trim().min(5, "Nhập lý do (tối thiểu 5 ký tự)").max(500),
  }),
  z.object({
    kind: z.literal("OVERTIME"),
    workDate: z.string().refine(isDateKey, "Ngày không hợp lệ"),
    start: z.string().refine(isHHmm, "Giờ bắt đầu HH:mm"),
    end: z.string().refine(isHHmm, "Giờ kết thúc HH:mm"),
    reason: z.string().trim().min(5, "Nhập nội dung công việc").max(500),
  }),
]);

export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "attendance.create");
  if (!ctx.employee) throw new HttpError(400, "Tài khoản chưa liên kết hồ sơ nhân viên");
  const employeeId = ctx.employee.id;
  const b = await parseBody(req, schema);
  const today = vnDateKey();
  const locked = await prisma.payrollPeriod.findFirst({ where: { status: "LOCKED", startDate: { lte: dbDate(b.workDate) }, endDate: { gte: dbDate(b.workDate) } } });
  if (locked) throw new HttpError(409, `Kỳ lương ${locked.code} đã khoá – không thể gửi yêu cầu cho ngày này`);

  if (b.kind === "ADJUSTMENT") {
    if (!b.checkIn && !b.checkOut) throw new HttpError(400, "Nhập giờ vào hoặc giờ ra cần điều chỉnh");
    if (b.workDate > today) throw new HttpError(400, "Không thể điều chỉnh công cho ngày tương lai");
    if (b.workDate < addDays(today, -60)) throw new HttpError(400, "Chỉ điều chỉnh được công trong 60 ngày gần nhất");
    const dup = await prisma.attendanceAdjustment.findFirst({ where: { employeeId, workDate: dbDate(b.workDate), status: "PENDING" } });
    if (dup) throw new HttpError(409, "Đã có đề nghị điều chỉnh đang chờ duyệt cho ngày này");
    const inAt = b.checkIn ? vnDateTime(b.workDate, b.checkIn) : null;
    const outAt = b.checkOut ? vnDateTime(b.checkOutNextDay ? addDays(b.workDate, 1) : b.workDate, b.checkOut) : null;
    if (inAt && outAt && outAt <= inAt) throw new HttpError(400, "Giờ ra phải sau giờ vào");
    const created = await prisma.$transaction(async (tx) => {
      const adj = await tx.attendanceAdjustment.create({ data: { employeeId, workDate: dbDate(b.workDate), requestedCheckIn: inAt, requestedCheckOut: outAt, reason: b.reason } });
      const a = await createApproval(tx, { type: "ATTENDANCE_ADJUSTMENT", entityId: adj.id, employeeId, requesterUserId: ctx.userId, title: `Điều chỉnh công ngày ${b.workDate.split("-").reverse().join("/")}${b.checkIn ? ` vào ${b.checkIn}` : ""}${b.checkOut ? ` ra ${b.checkOut}` : ""}`, requiredLevels: 1 });
      await audit(ctx, { action: "CREATE", entityType: "AttendanceAdjustment", entityId: adj.id, summary: `Gửi đề nghị điều chỉnh công ${b.workDate}` }, req, tx);
      return a;
    });
    await notifyApprovers(created.id);
    return { id: created.id };
  }

  // Tăng ca
  const start = vnDateTime(b.workDate, b.start);
  let end = vnDateTime(b.workDate, b.end);
  if (end <= start) end = vnDateTime(addDays(b.workDate, 1), b.end); // tăng ca qua nửa đêm
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes < 15 || minutes > 12 * 60) throw new HttpError(400, "Thời lượng tăng ca phải từ 15 phút đến 12 giờ");
  const overlap = await prisma.overtimeRequest.findFirst({ where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, startAt: { lt: end }, endAt: { gt: start } } });
  if (overlap) throw new HttpError(409, "Trùng với một đăng ký tăng ca khác");
  const policy = await getSetting("overtime");
  const mr = monthRange(Number(b.workDate.slice(0, 4)), Number(b.workDate.slice(5, 7)));
  const monthAgg = await prisma.overtimeRequest.aggregate({ where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, workDate: { gte: dbDate(mr.from), lte: dbDate(mr.to) } }, _sum: { minutes: true } });
  const monthHours = ((monthAgg._sum.minutes ?? 0) + minutes) / 60;
  const holiday = await prisma.holiday.findUnique({ where: { date: dbDate(b.workDate) } });
  const att = await getSetting("attendance");
  const dayKind = holiday ? "HOLIDAY" : att.workingDays.includes(dayOfWeek(b.workDate)) ? "WEEKDAY" : "WEEKEND";
  const created = await prisma.$transaction(async (tx) => {
    const ot = await tx.overtimeRequest.create({ data: { employeeId, workDate: dbDate(b.workDate), startAt: start, endAt: end, minutes, dayKind, reason: b.reason } });
    const a = await createApproval(tx, {
      type: "OVERTIME",
      entityId: ot.id,
      employeeId,
      requesterUserId: ctx.userId,
      title: `Tăng ca ${b.workDate.split("-").reverse().join("/")} ${b.start}–${b.end} (${(minutes / 60).toFixed(1)}h)${monthHours > policy.maxHoursPerMonth ? ` – VƯỢT ${policy.maxHoursPerMonth}h/tháng` : ""}`,
      requiredLevels: policy.approvalLevels,
    });
    await audit(ctx, { action: "CREATE", entityType: "OvertimeRequest", entityId: ot.id, summary: `Đăng ký tăng ca ${b.workDate} ${minutes} phút` }, req, tx);
    return a;
  });
  await notifyApprovers(created.id);
  return { id: created.id, warning: monthHours > policy.maxHoursPerMonth ? `Tổng tăng ca tháng này (${monthHours.toFixed(1)}h) vượt giới hạn cấu hình ${policy.maxHoursPerMonth}h` : null };
});
