import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { assertEmployeeAccess, requirePerm } from "@/lib/rbac";
import { dbDate, isDateKey } from "@/lib/dates";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notify";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add_task"), title: z.string().trim().min(2).max(200), category: z.string().max(30).default("OTHER"), assigneeId: z.string().nullable().optional(), dueDate: z.string().refine(isDateKey).nullable().optional() }),
  z.object({ action: z.literal("toggle_task"), taskId: z.string(), done: z.boolean(), note: z.string().trim().max(500).nullable().optional() }),
  z.object({ action: z.literal("assign_task"), taskId: z.string(), assigneeId: z.string().nullable(), dueDate: z.string().refine(isDateKey).nullable().optional() }),
  z.object({ action: z.literal("complete"), applyResignation: z.boolean().default(false), lockAccount: z.boolean().default(false), confirmProbationPassed: z.boolean().default(false) }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3).max(500) }),
]);

export const POST = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "lifecycle.update");
  const c = await prisma.lifecycleChecklist.findUnique({ where: { id: params.id }, include: { tasks: true, employee: { select: { id: true, departmentId: true, branchId: true, managerId: true, fullName: true, status: true } } } });
  if (!c) throw new HttpError(404, "Checklist không tồn tại");
  assertEmployeeAccess(ctx, "lifecycle.update", c.employee);
  if (c.status !== "IN_PROGRESS") throw new HttpError(409, "Checklist đã kết thúc");
  const b = await parseBody(req, schema);

  if (b.action === "add_task") {
    await prisma.lifecycleTask.create({ data: { checklistId: c.id, title: b.title, category: b.category, assigneeId: b.assigneeId ?? null, dueDate: b.dueDate ? dbDate(b.dueDate) : null, sort: c.tasks.length } });
    if (b.assigneeId) await notifyEmployee(b.assigneeId, { type: "TASK", title: "Bạn được giao đầu việc", body: `${b.title} – ${c.employee.fullName}`, link: `/lifecycle/${c.id}` });
    return { ok: true };
  }
  if (b.action === "toggle_task" || b.action === "assign_task") {
    const t = c.tasks.find((x) => x.id === b.taskId);
    if (!t) throw new HttpError(404, "Đầu việc không tồn tại");
    if (b.action === "toggle_task") {
      await prisma.lifecycleTask.update({ where: { id: t.id }, data: { doneAt: b.done ? new Date() : null, doneById: b.done ? ctx.userId : null, note: b.note ?? t.note } });
      await audit(ctx, { action: "UPDATE", entityType: "LifecycleChecklist", entityId: c.id, summary: `${b.done ? "Hoàn thành" : "Bỏ hoàn thành"}: ${t.title} (${c.employee.fullName})` }, req);
    } else {
      await prisma.lifecycleTask.update({ where: { id: t.id }, data: { assigneeId: b.assigneeId, dueDate: b.dueDate ? dbDate(b.dueDate) : t.dueDate } });
      if (b.assigneeId) await notifyEmployee(b.assigneeId, { type: "TASK", title: "Bạn được giao đầu việc", body: `${t.title} – ${c.employee.fullName}`, link: `/lifecycle/${c.id}` });
    }
    return { ok: true };
  }
  if (b.action === "cancel") {
    await prisma.lifecycleChecklist.update({ where: { id: c.id }, data: { status: "CANCELLED", reason: `${c.reason ?? ""}\nHuỷ: ${b.reason}`.trim() } });
    await audit(ctx, { action: "CANCEL", entityType: "LifecycleChecklist", entityId: c.id, summary: `Huỷ checklist của ${c.employee.fullName}: ${b.reason}` }, req);
    return { ok: true };
  }
  // complete
  const pending = c.tasks.filter((t) => !t.doneAt);
  if (pending.length) throw new HttpError(409, `Còn ${pending.length} đầu việc chưa hoàn thành`);
  const assetsHeld = await prisma.asset.count({ where: { currentHolderId: c.employeeId } });
  if (c.type === "OFFBOARDING" && assetsHeld) throw new HttpError(409, `Nhân viên còn giữ ${assetsHeld} tài sản – hãy thu hồi trước khi hoàn tất`);
  await prisma.$transaction(async (tx) => {
    await tx.lifecycleChecklist.update({ where: { id: c.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    // Các thay đổi trạng thái chỉ thực hiện khi HR chọn rõ ràng (không tự động ra quyết định)
    if (c.type === "OFFBOARDING" && b.applyResignation) {
      await tx.employee.update({ where: { id: c.employeeId }, data: { status: "RESIGNED", endDate: c.targetDate } });
      await tx.employmentContract.updateMany({ where: { employeeId: c.employeeId, status: "ACTIVE" }, data: { status: "TERMINATED" } });
    }
    if (c.type === "OFFBOARDING" && b.lockAccount) {
      const u = await tx.user.findUnique({ where: { employeeId: c.employeeId } });
      if (u) {
        await tx.user.update({ where: { id: u.id }, data: { isActive: false } });
        await tx.session.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    }
    if (c.type === "ONBOARDING" && b.confirmProbationPassed && c.employee.status === "PROBATION") {
      await tx.employee.update({ where: { id: c.employeeId }, data: { status: "ACTIVE" } });
    }
    await audit(ctx, {
      action: "UPDATE",
      entityType: "LifecycleChecklist",
      entityId: c.id,
      summary: `Hoàn tất ${c.type === "ONBOARDING" ? "tiếp nhận" : "nghỉ việc"} – ${c.employee.fullName}${b.applyResignation ? " · chuyển trạng thái Đã nghỉ việc" : ""}${b.lockAccount ? " · khoá tài khoản" : ""}${b.confirmProbationPassed ? " · xác nhận đạt thử việc" : ""}`,
    }, req, tx);
  });
  return { ok: true };
});
