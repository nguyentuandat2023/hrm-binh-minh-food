// Quy trình phê duyệt dùng chung (nghỉ phép, điều chỉnh công, tăng ca) – hỗ trợ nhiều cấp.
// Cấp 1: người có quyền duyệt với phạm vi bao phủ nhân viên (trưởng phòng/quản lý trực tiếp/HR).
// Cấp 2: người có quyền duyệt phạm vi TOÀN CÔNG TY (HR/Ban giám đốc). Một người không duyệt 2 cấp của cùng yêu cầu.
import type { ApprovalType } from "@prisma/client";
import { prisma, type Tx } from "../db";
import { canAccessEmployee, type AuthCtx, type EmployeeRef } from "../rbac";
import { HttpError } from "../errors";
import { audit } from "../audit";
import { notifyEmployee, notifyUsers, usersWithPermFor } from "../notify";
import { dbDate, keyOf } from "../dates";
import { recomputeRecord } from "./attendance";

export const APPROVAL_PERM: Record<ApprovalType, string> = {
  LEAVE: "leave.approve",
  ATTENDANCE_ADJUSTMENT: "attendance.approve",
  OVERTIME: "attendance.approve",
};

export const APPROVAL_LABEL: Record<ApprovalType, string> = {
  LEAVE: "Nghỉ phép",
  ATTENDANCE_ADJUSTMENT: "Điều chỉnh công",
  OVERTIME: "Tăng ca",
};

const LINK: Record<ApprovalType, string> = {
  LEAVE: "/leave",
  ATTENDANCE_ADJUSTMENT: "/attendance/requests",
  OVERTIME: "/attendance/requests",
};

export interface ApprovalCheckInput {
  type: ApprovalType;
  status: string;
  currentLevel: number;
  employee: EmployeeRef;
  priorActors: string[];
}

/** Hàm thuần: user hiện tại có được duyệt cấp hiện tại không? Trả về lý do nếu không. */
export function approvalBlockReason(ctx: Pick<AuthCtx, "userId" | "perms" | "employee" | "departmentIds">, a: ApprovalCheckInput): string | null {
  if (a.status !== "PENDING") return "Yêu cầu đã được xử lý";
  const key = APPROVAL_PERM[a.type];
  if (ctx.employee?.id === a.employee.id) return "Không thể tự duyệt yêu cầu của chính mình";
  if (a.priorActors.includes(ctx.userId)) return "Bạn đã duyệt ở cấp trước, cần người khác duyệt cấp này";
  if (a.currentLevel === 1) {
    if (!canAccessEmployee(ctx, key, a.employee)) return "Bạn không có quyền duyệt yêu cầu của nhân viên này";
  } else if (ctx.perms[key] !== "COMPANY") {
    return "Cấp duyệt này yêu cầu quyền duyệt toàn công ty (HR/Ban giám đốc)";
  }
  return null;
}

export async function createApproval(
  tx: Tx,
  input: { type: ApprovalType; entityId: string; employeeId: string; requesterUserId: string; title: string; requiredLevels: number },
) {
  return tx.approvalRequest.create({ data: { ...input, requiredLevels: Math.max(1, Math.min(2, input.requiredLevels)) } });
}

export async function notifyApprovers(approvalId: string) {
  const a = await prisma.approvalRequest.findUniqueOrThrow({
    where: { id: approvalId },
    include: { employee: { select: { id: true, departmentId: true, branchId: true, managerId: true, fullName: true } } },
  });
  const users = await usersWithPermFor(APPROVAL_PERM[a.type], a.employee, { minCompany: a.currentLevel > 1 });
  await notifyUsers(users, {
    type: "APPROVAL_PENDING",
    title: `${APPROVAL_LABEL[a.type]} chờ duyệt${a.requiredLevels > 1 ? ` (cấp ${a.currentLevel}/${a.requiredLevels})` : ""}`,
    body: `${a.employee.fullName}: ${a.title}`,
    link: `/approvals`,
    dedupeKey: `approval:${a.id}:L${a.currentLevel}`,
  });
}

export async function decideApproval(ctx: AuthCtx, approvalId: string, decision: "APPROVED" | "REJECTED", comment: string | undefined, req?: Request) {
  const a = await prisma.approvalRequest.findUnique({
    where: { id: approvalId },
    include: { steps: true, employee: { select: { id: true, departmentId: true, branchId: true, managerId: true, fullName: true } } },
  });
  if (!a) throw new HttpError(404, "Yêu cầu không tồn tại");
  const reason = approvalBlockReason(ctx, {
    type: a.type,
    status: a.status,
    currentLevel: a.currentLevel,
    employee: a.employee,
    priorActors: a.steps.map((s) => s.actorUserId),
  });
  if (reason) throw new HttpError(a.status !== "PENDING" ? 409 : 403, reason);
  if (decision === "REJECTED" && !comment?.trim()) throw new HttpError(400, "Vui lòng nhập lý do từ chối");

  const level = a.currentLevel;
  const final = decision === "REJECTED" || level >= a.requiredLevels;
  await prisma.$transaction(async (tx) => {
    // Khoá lạc quan: chỉ cập nhật nếu trạng thái/cấp chưa bị người khác thay đổi
    const upd = await tx.approvalRequest.updateMany({
      where: { id: a.id, status: "PENDING", currentLevel: level },
      data: final ? { status: decision, decidedAt: new Date() } : { currentLevel: level + 1 },
    });
    if (upd.count !== 1) throw new HttpError(409, "Yêu cầu vừa được người khác xử lý, vui lòng tải lại");
    await tx.approvalStep.create({ data: { requestId: a.id, level, actorUserId: ctx.userId, decision, comment: comment?.slice(0, 1000) } });
    if (final) await applyFinal(tx, a.type, a.entityId, decision);
    await audit(ctx, {
      action: decision === "APPROVED" ? "APPROVE" : "REJECT",
      entityType: a.type,
      entityId: a.entityId,
      summary: `${decision === "APPROVED" ? "Duyệt" : "Từ chối"} cấp ${level}: ${APPROVAL_LABEL[a.type]} của ${a.employee.fullName}`,
    }, req, tx);
  });

  if (final) {
    await notifyEmployee(a.employeeId, {
      type: "APPROVAL_RESULT",
      title: `${APPROVAL_LABEL[a.type]} ${decision === "APPROVED" ? "đã được duyệt" : "bị từ chối"}`,
      body: comment ? `${a.title} – ${comment}` : a.title,
      link: LINK[a.type],
    });
  } else {
    await notifyApprovers(a.id);
  }
}

/** Không cho thay đổi công/phép thuộc kỳ lương đã khoá */
export async function assertPeriodOpen(tx: Tx, from: Date, to: Date = from) {
  const locked = await tx.payrollPeriod.findFirst({ where: { status: "LOCKED", startDate: { lte: to }, endDate: { gte: from } } });
  if (locked) throw new HttpError(409, `Kỳ lương ${locked.code} đã khoá – không thể duyệt thay đổi ảnh hưởng tới kỳ này`);
}

async function applyFinal(tx: Tx, type: ApprovalType, entityId: string, decision: "APPROVED" | "REJECTED") {
  const now = new Date();
  if (decision === "APPROVED") {
    if (type === "LEAVE") {
      const l = await tx.leaveRequest.findUniqueOrThrow({ where: { id: entityId } });
      await assertPeriodOpen(tx, l.startDate, l.endDate);
    } else if (type === "ATTENDANCE_ADJUSTMENT") {
      await assertPeriodOpen(tx, (await tx.attendanceAdjustment.findUniqueOrThrow({ where: { id: entityId } })).workDate);
    } else {
      await assertPeriodOpen(tx, (await tx.overtimeRequest.findUniqueOrThrow({ where: { id: entityId } })).workDate);
    }
  }
  if (type === "LEAVE") {
    const lr = await tx.leaveRequest.update({
      where: { id: entityId },
      data: { status: decision, decidedAt: now },
      include: { leaveType: true },
    });
    if (decision === "APPROVED" && lr.leaveType.deductsBalance) {
      const year = lr.startDate.getUTCFullYear();
      await tx.leaveBalance.update({
        where: { employeeId_leaveTypeId_year: { employeeId: lr.employeeId, leaveTypeId: lr.leaveTypeId, year } },
        data: { used: { increment: lr.days } },
      });
    }
  } else if (type === "OVERTIME") {
    await tx.overtimeRequest.update({ where: { id: entityId }, data: { status: decision, decidedAt: now } });
  } else if (type === "ATTENDANCE_ADJUSTMENT") {
    const adj = await tx.attendanceAdjustment.update({ where: { id: entityId }, data: { status: decision, decidedAt: now } });
    if (decision === "APPROVED") {
      const data: Record<string, unknown> = {};
      if (adj.requestedCheckIn) Object.assign(data, { checkInAt: adj.requestedCheckIn, checkInMethod: "ADJUSTMENT" });
      if (adj.requestedCheckOut) Object.assign(data, { checkOutAt: adj.requestedCheckOut, checkOutMethod: "ADJUSTMENT" });
      const rec = await tx.attendanceRecord.upsert({
        where: { employeeId_workDate: { employeeId: adj.employeeId, workDate: dbDate(keyOf(adj.workDate)!) } },
        create: { employeeId: adj.employeeId, workDate: adj.workDate, ...data, note: `Điều chỉnh: ${adj.reason}`.slice(0, 300) },
        update: { ...data, note: `Điều chỉnh: ${adj.reason}`.slice(0, 300) },
      });
      await recomputeRecord(rec.id, tx);
    }
  }
}

/** Người gửi huỷ yêu cầu đang chờ duyệt */
export async function cancelApprovalByEntity(tx: Tx, type: ApprovalType, entityId: string, actorUserId: string) {
  const a = await tx.approvalRequest.findUnique({ where: { type_entityId: { type, entityId } } });
  if (!a) return;
  if (a.status === "PENDING" || a.status === "APPROVED") {
    await tx.approvalRequest.update({ where: { id: a.id }, data: { status: "CANCELLED", decidedAt: new Date() } });
    await tx.approvalStep.create({ data: { requestId: a.id, level: a.currentLevel, actorUserId, decision: "CANCELLED" } });
  }
}
