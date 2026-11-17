import { prisma, type Tx } from "../db";
import { dbDate, keyOf, vnDateKey, type DateKey } from "../dates";
import { getSetting } from "../settings";
import { annualEntitlement, available, countLeaveDays } from "../leave-calc";
import { HttpError } from "../errors";
import { isWorkingDayFn, loadScheduleContext } from "./attendance";
import { cancelApprovalByEntity, createApproval, notifyApprovers } from "./approval";
import { audit } from "../audit";
import type { AuthCtx } from "../rbac";

export const ANNUAL_CODE = "ANNUAL";

export async function ensureBalance(employeeId: string, leaveTypeId: string, year: number, tx: Tx = prisma) {
  const existing = await tx.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } } });
  if (existing) return existing;
  const [emp, type, policy] = await Promise.all([
    tx.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { startDate: true } }),
    tx.leaveType.findUniqueOrThrow({ where: { id: leaveTypeId } }),
    getSetting("leave"),
  ]);
  const entitled = type.code === ANNUAL_CODE ? annualEntitlement(keyOf(emp.startDate)!, year, policy) : type.defaultQuota;
  return tx.leaveBalance.upsert({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    create: { employeeId, leaveTypeId, year, entitled },
    update: {},
  });
}

export async function pendingDays(employeeId: string, leaveTypeId: string, year: number, tx: Tx = prisma) {
  const agg = await tx.leaveRequest.aggregate({
    where: { employeeId, leaveTypeId, status: "PENDING", startDate: { gte: dbDate(`${year}-01-01`), lte: dbDate(`${year}-12-31`) } },
    _sum: { days: true },
  });
  return agg._sum.days ?? 0;
}

export async function computeDays(employeeId: string, start: DateKey, end: DateKey, halfDay: "NONE" | "MORNING" | "AFTERNOON") {
  const sctx = await loadScheduleContext([employeeId], start, end);
  return countLeaveDays(start, end, halfDay, isWorkingDayFn(sctx, employeeId));
}

export interface SubmitLeaveInput {
  leaveTypeId: string;
  startDate: DateKey;
  endDate: DateKey;
  halfDay: "NONE" | "MORNING" | "AFTERNOON";
  reason: string;
  attachmentId?: string | null;
}

export async function submitLeave(ctx: AuthCtx, employeeId: string, input: SubmitLeaveInput, req?: Request) {
  if (input.endDate < input.startDate) throw new HttpError(400, "Ngày kết thúc phải sau ngày bắt đầu");
  if (input.startDate.slice(0, 4) !== input.endDate.slice(0, 4)) throw new HttpError(400, "Đơn nghỉ không được vượt qua năm – vui lòng tách thành 2 đơn");
  if (input.halfDay !== "NONE" && input.startDate !== input.endDate) throw new HttpError(400, "Nghỉ nửa ngày chỉ áp dụng cho 1 ngày");
  const type = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } });
  if (!type || !type.isActive) throw new HttpError(400, "Loại nghỉ không hợp lệ");
  if (type.requiresAttachment && !input.attachmentId) throw new HttpError(400, `Loại nghỉ "${type.name}" yêu cầu đính kèm giấy tờ`);

  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: dbDate(input.endDate) },
      endDate: { gte: dbDate(input.startDate) },
    },
  });
  if (overlap) throw new HttpError(409, "Đã có đơn nghỉ khác trùng khoảng thời gian này");

  const days = await computeDays(employeeId, input.startDate, input.endDate, input.halfDay);
  if (days <= 0) throw new HttpError(400, "Khoảng thời gian đã chọn không có ngày làm việc");

  const year = Number(input.startDate.slice(0, 4));
  const policy = await getSetting("leave");
  if (type.deductsBalance) {
    const bal = await ensureBalance(employeeId, type.id, year);
    const avail = available(bal, await pendingDays(employeeId, type.id, year));
    if (avail < days && !policy.allowNegativeBalance) {
      throw new HttpError(400, `Không đủ ngày phép: còn ${avail} ngày (kể cả đơn đang chờ), cần ${days} ngày`);
    }
  }
  const requiredLevels = policy.twoLevelMinDays > 0 && days >= policy.twoLevelMinDays ? 2 : 1;
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { fullName: true } });

  const created = await prisma.$transaction(async (tx) => {
    const lr = await tx.leaveRequest.create({
      data: { employeeId, leaveTypeId: type.id, startDate: dbDate(input.startDate), endDate: dbDate(input.endDate), halfDay: input.halfDay, days, reason: input.reason, attachmentId: input.attachmentId ?? null },
    });
    const approval = await createApproval(tx, {
      type: "LEAVE",
      entityId: lr.id,
      employeeId,
      requesterUserId: ctx.userId,
      title: `${type.name} ${days} ngày (${input.startDate.split("-").reverse().join("/")}${input.endDate !== input.startDate ? " → " + input.endDate.split("-").reverse().join("/") : ""})`,
      requiredLevels,
    });
    await audit(ctx, { action: "CREATE", entityType: "LeaveRequest", entityId: lr.id, summary: `Gửi đơn ${type.name} ${days} ngày cho ${emp.fullName}` }, req, tx);
    return { lr, approval };
  });
  await notifyApprovers(created.approval.id);
  return created.lr;
}

/** Huỷ đơn: nhân viên huỷ đơn chờ duyệt hoặc đơn đã duyệt chưa bắt đầu; HR (leave.update toàn công ty) huỷ bất kỳ */
export async function cancelLeave(ctx: AuthCtx, id: string, req?: Request) {
  const lr = await prisma.leaveRequest.findUnique({ where: { id }, include: { leaveType: true, employee: { select: { fullName: true } } } });
  if (!lr) throw new HttpError(404, "Đơn nghỉ không tồn tại");
  const isOwner = ctx.employee?.id === lr.employeeId;
  const isHr = ctx.perms["leave.update"] === "COMPANY";
  if (!isOwner && !isHr) throw new HttpError(403, "Bạn không có quyền huỷ đơn này");
  if (lr.status !== "PENDING" && lr.status !== "APPROVED") throw new HttpError(409, "Đơn đã được xử lý, không thể huỷ");
  if (lr.status === "APPROVED" && !isHr && keyOf(lr.startDate)! <= vnDateKey()) {
    throw new HttpError(409, "Đơn đã duyệt và đã bắt đầu – liên hệ HR để huỷ");
  }
  await prisma.$transaction(async (tx) => {
    const upd = await tx.leaveRequest.updateMany({ where: { id, status: lr.status }, data: { status: "CANCELLED", decidedAt: new Date() } });
    if (upd.count !== 1) throw new HttpError(409, "Đơn vừa thay đổi trạng thái, vui lòng tải lại");
    if (lr.status === "APPROVED" && lr.leaveType.deductsBalance) {
      await tx.leaveBalance.update({
        where: { employeeId_leaveTypeId_year: { employeeId: lr.employeeId, leaveTypeId: lr.leaveTypeId, year: lr.startDate.getUTCFullYear() } },
        data: { used: { decrement: lr.days } },
      });
    }
    await cancelApprovalByEntity(tx, "LEAVE", id, ctx.userId);
    await audit(ctx, { action: "CANCEL", entityType: "LeaveRequest", entityId: id, summary: `Huỷ đơn ${lr.leaveType.name} của ${lr.employee.fullName}` }, req, tx);
  });
}
