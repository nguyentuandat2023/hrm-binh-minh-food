import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { canAccessEmployee } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

const schema = z.object({ value: z.number().min(-1e12).max(1e12), note: z.string().trim().max(1000).nullable().optional() });

/** Cập nhật kết quả thực tế (nhân viên tự cập nhật KPI của mình; quản lý cập nhật trong phạm vi) */
export const POST = api(async (req, { ctx, params }) => {
  const a = await prisma.kpiAssignment.findUnique({ where: { id: params.id }, include: { definition: true, employee: { select: { id: true, departmentId: true, branchId: true, managerId: true } } } });
  if (!a) throw new HttpError(404, "KPI không tồn tại");
  const ok = a.employee ? canAccessEmployee(ctx, "kpi.update", a.employee) || canAccessEmployee(ctx, "kpi.create", a.employee) : ctx.perms["kpi.create"] === "COMPANY" || (!!a.departmentId && ctx.departmentIds.includes(a.departmentId) && !!ctx.perms["kpi.create"]);
  if (!ok) throw new HttpError(403, "Bạn không có quyền cập nhật KPI này");
  if (a.status !== "OPEN") throw new HttpError(409, "KPI đã nộp/đánh giá – không cập nhật kết quả được");
  const b = await parseBody(req, schema);
  await prisma.kpiResult.create({ data: { assignmentId: a.id, value: b.value, note: b.note ?? null, recordedById: ctx.userId } });
  await audit(ctx, { action: "UPDATE", entityType: "KpiAssignment", entityId: a.id, summary: `Cập nhật kết quả KPI ${a.definition.name}: ${b.value} ${a.definition.unit}` }, req);
  return { ok: true };
});
