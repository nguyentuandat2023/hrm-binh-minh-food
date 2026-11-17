import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { canAccessEmployee, requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notify";

const schema = z.object({
  definitionId: z.string().min(1, "Chọn KPI"),
  employeeIds: z.array(z.string()).max(500).default([]),
  departmentId: z.string().nullable().optional(),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/, "Kỳ dạng YYYY-MM hoặc YYYY-Q1..Q4"),
  target: z.number().min(0),
  weight: z.number().min(0.01).max(100),
});

/** Giao KPI cho nhiều nhân viên hoặc cho cả phòng ban */
export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "kpi.create");
  const b = await parseBody(req, schema);
  if (!b.employeeIds.length && !b.departmentId) throw new HttpError(400, "Chọn nhân viên hoặc phòng ban");
  const def = await prisma.kpiDefinition.findFirst({ where: { id: b.definitionId, isActive: true } });
  if (!def) throw new HttpError(400, "KPI không hợp lệ");
  const emps = await prisma.employee.findMany({ where: { id: { in: b.employeeIds } }, select: { id: true, departmentId: true, branchId: true, managerId: true } });
  for (const e of emps) if (!canAccessEmployee(ctx, "kpi.create", e)) throw new HttpError(403, "Có nhân viên ngoài phạm vi quản lý của bạn");
  if (b.departmentId && ctx.perms["kpi.create"] !== "COMPANY" && !ctx.departmentIds.includes(b.departmentId)) throw new HttpError(403, "Phòng ban ngoài phạm vi quản lý");
  await prisma.$transaction(async (tx) => {
    for (const e of emps) {
      const dup = await tx.kpiAssignment.findFirst({ where: { definitionId: def.id, employeeId: e.id, period: b.period } });
      if (dup) throw new HttpError(409, "Nhân viên đã được giao KPI này trong kỳ");
      await tx.kpiAssignment.create({ data: { definitionId: def.id, employeeId: e.id, period: b.period, target: b.target, weight: b.weight, createdById: ctx.userId } });
    }
    if (b.departmentId) await tx.kpiAssignment.create({ data: { definitionId: def.id, departmentId: b.departmentId, period: b.period, target: b.target, weight: b.weight, createdById: ctx.userId } });
    await audit(ctx, { action: "CREATE", entityType: "KpiAssignment", summary: `Giao KPI "${def.name}" kỳ ${b.period} cho ${emps.length} nhân viên${b.departmentId ? " + phòng ban" : ""}` }, req, tx);
  });
  for (const e of emps) await notifyEmployee(e.id, { type: "KPI_ASSIGNED", title: "Bạn được giao KPI mới", body: `${def.name} – kỳ ${b.period}, mục tiêu ${b.target} ${def.unit}`, link: `/me?tab=kpi&period=${b.period}` });
  return { created: emps.length + (b.departmentId ? 1 : 0) };
});
