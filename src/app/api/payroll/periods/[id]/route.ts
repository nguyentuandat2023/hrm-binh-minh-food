import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { calculatePeriod } from "@/lib/services/payroll";
import { audit } from "@/lib/audit";
import { notifyUsers } from "@/lib/notify";

const schema = z.object({ action: z.enum(["calculate", "approve", "lock", "reopen"]) });

/** Quy trình kỳ lương: Nháp → Tính lương → (kiểm tra) → Duyệt → Khoá & phát hành phiếu lương */
export const POST = api(async (req, { ctx, params }) => {
  const { action } = await parseBody(req, schema);
  const p = await prisma.payrollPeriod.findUnique({ where: { id: params.id } });
  if (!p) throw new HttpError(404, "Kỳ lương không tồn tại");
  if (p.status === "LOCKED") throw new HttpError(409, "Kỳ lương đã khoá – không thể thay đổi");

  if (action === "calculate") {
    requirePerm(ctx, "payroll.create", "COMPANY");
    return calculatePeriod(ctx, p.id, req);
  }
  if (action === "reopen") {
    requirePerm(ctx, "payroll.create", "COMPANY");
    if (p.status === "DRAFT") throw new HttpError(409, "Kỳ lương đang ở trạng thái nháp");
    await prisma.payrollPeriod.update({ where: { id: p.id }, data: { status: "DRAFT", approvedAt: null, approvedById: null } });
    await audit(ctx, { action: "UPDATE", entityType: "PayrollPeriod", entityId: p.id, summary: `Mở lại ${p.name} về trạng thái nháp` }, req);
    return { ok: true };
  }
  requirePerm(ctx, "payroll.approve", "COMPANY");
  if (action === "approve") {
    if (p.status !== "CALCULATED") throw new HttpError(409, "Chỉ duyệt được kỳ lương đã tính");
    // Phân tách nhiệm vụ: người tính lương không tự duyệt
    if (p.calculatedById === ctx.userId) throw new HttpError(403, "Người tính lương không được tự duyệt kỳ lương (phân tách nhiệm vụ)");
    const upd = await prisma.payrollPeriod.updateMany({ where: { id: p.id, status: "CALCULATED" }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: ctx.userId } });
    if (upd.count !== 1) throw new HttpError(409, "Kỳ lương vừa thay đổi trạng thái");
    await audit(ctx, { action: "PAYROLL_APPROVED", entityType: "PayrollPeriod", entityId: p.id, summary: `Duyệt ${p.name}` }, req);
    return { ok: true };
  }
  // lock
  if (p.status !== "APPROVED") throw new HttpError(409, "Chỉ khoá được kỳ lương đã duyệt");
  const upd = await prisma.payrollPeriod.updateMany({ where: { id: p.id, status: "APPROVED" }, data: { status: "LOCKED", lockedAt: new Date(), lockedById: ctx.userId, publishedAt: new Date() } });
  if (upd.count !== 1) throw new HttpError(409, "Kỳ lương vừa thay đổi trạng thái");
  await audit(ctx, { action: "PAYROLL_LOCKED", entityType: "PayrollPeriod", entityId: p.id, summary: `Khoá & phát hành phiếu lương ${p.name}` }, req);
  const recs = await prisma.payrollRecord.findMany({ where: { periodId: p.id }, select: { id: true, employee: { select: { user: { select: { id: true, isActive: true } } } } } });
  for (const r of recs) {
    const u = r.employee.user;
    if (u?.isActive) await notifyUsers([u.id], { type: "PAYSLIP", title: "Phiếu lương đã được phát hành", body: p.name, link: `/payroll/payslip/${r.id}`, dedupeKey: `payslip:${r.id}` });
  }
  return { ok: true, published: recs.length };
});

/** Xoá kỳ lương nháp chưa có dữ liệu duyệt */
export const DELETE = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "payroll.create", "COMPANY");
  const p = await prisma.payrollPeriod.findUnique({ where: { id: params.id } });
  if (!p) throw new HttpError(404, "Kỳ lương không tồn tại");
  if (p.status !== "DRAFT" && p.status !== "CALCULATED") throw new HttpError(409, "Chỉ xoá được kỳ lương nháp/chưa duyệt");
  await prisma.payrollPeriod.delete({ where: { id: p.id } });
  await audit(ctx, { action: "DELETE", entityType: "PayrollPeriod", entityId: p.id, summary: `Xoá ${p.name}` }, req);
  return { ok: true };
});
