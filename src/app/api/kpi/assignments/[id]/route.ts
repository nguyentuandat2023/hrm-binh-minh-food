import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { canAccessEmployee, type AuthCtx } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

async function load(ctx: AuthCtx, id: string, perm: string) {
  const a = await prisma.kpiAssignment.findUnique({ where: { id }, include: { definition: true, employee: { select: { id: true, departmentId: true, branchId: true, managerId: true, fullName: true } }, _count: { select: { results: true } } } });
  if (!a) throw new HttpError(404, "KPI không tồn tại");
  const ok = a.employee ? canAccessEmployee(ctx, perm, a.employee) : ctx.perms[perm] === "COMPANY" || (!!a.departmentId && !!ctx.perms[perm] && ctx.departmentIds.includes(a.departmentId));
  if (!ok) throw new HttpError(403, "Bạn không có quyền với KPI này");
  return a;
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), target: z.number().min(0), weight: z.number().min(0.01).max(100) }),
  z.object({ action: z.literal("submit") }),
  z.object({ action: z.literal("review"), managerScore: z.number().min(0).max(200).nullable().optional(), managerNote: z.string().trim().max(1000).nullable().optional() }),
  z.object({ action: z.literal("close") }),
  z.object({ action: z.literal("reopen") }),
]);

export const PATCH = api(async (req, { ctx, params }) => {
  const b = await parseBody(req, schema);
  if (b.action === "submit") {
    const a = await load(ctx, params.id, "kpi.update");
    if (a.status !== "OPEN") throw new HttpError(409, "KPI không ở trạng thái đang thực hiện");
    await prisma.kpiAssignment.update({ where: { id: a.id }, data: { status: "SUBMITTED" } });
    await audit(ctx, { action: "UPDATE", entityType: "KpiAssignment", entityId: a.id, summary: `Nộp kết quả KPI ${a.definition.name} kỳ ${a.period}` }, req);
    return { ok: true };
  }
  if (b.action === "edit") {
    const a = await load(ctx, params.id, "kpi.create");
    if (a.status === "CLOSED") throw new HttpError(409, "KPI đã chốt");
    await prisma.kpiAssignment.update({ where: { id: a.id }, data: { target: b.target, weight: b.weight } });
    await audit(ctx, { action: "UPDATE", entityType: "KpiAssignment", entityId: a.id, summary: `Sửa chỉ tiêu KPI ${a.definition.name}`, changes: { target: { from: a.target, to: b.target }, weight: { from: a.weight, to: b.weight } } }, req);
    return { ok: true };
  }
  const a = await load(ctx, params.id, "kpi.approve");
  if (a.employee && a.employee.id === ctx.employee?.id) throw new HttpError(403, "Không tự đánh giá KPI của mình");
  if (b.action === "review") {
    if (a.status === "CLOSED") throw new HttpError(409, "KPI đã chốt");
    await prisma.kpiAssignment.update({ where: { id: a.id }, data: { status: "REVIEWED", managerScore: b.managerScore ?? null, managerNote: b.managerNote ?? null } });
  } else if (b.action === "close") {
    if (a.status !== "REVIEWED") throw new HttpError(409, "Cần đánh giá trước khi chốt");
    await prisma.kpiAssignment.update({ where: { id: a.id }, data: { status: "CLOSED" } });
  } else {
    if (a.status === "CLOSED" && ctx.perms["kpi.approve"] !== "COMPANY") throw new HttpError(403, "Chỉ HR/Ban giám đốc mở lại KPI đã chốt");
    await prisma.kpiAssignment.update({ where: { id: a.id }, data: { status: "OPEN" } });
  }
  await audit(ctx, { action: b.action === "review" ? "APPROVE" : "UPDATE", entityType: "KpiAssignment", entityId: a.id, summary: `${b.action === "review" ? "Đánh giá" : b.action === "close" ? "Chốt" : "Mở lại"} KPI ${a.definition.name} kỳ ${a.period}${a.employee ? ` – ${a.employee.fullName}` : ""}` }, req);
  return { ok: true };
});

export const DELETE = api(async (req, { ctx, params }) => {
  const a = await load(ctx, params.id, "kpi.create");
  if (a._count.results > 0 || a.status !== "OPEN") throw new HttpError(409, "Chỉ xoá được KPI chưa có kết quả");
  await prisma.kpiAssignment.delete({ where: { id: a.id } });
  await audit(ctx, { action: "DELETE", entityType: "KpiAssignment", entityId: a.id, summary: `Xoá KPI ${a.definition.name} kỳ ${a.period}` }, req);
  return { ok: true };
});
