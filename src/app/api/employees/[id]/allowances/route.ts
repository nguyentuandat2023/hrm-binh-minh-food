import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { getEmployeeForCtx } from "@/lib/services/employee";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

const schema = z.object({ name: z.string().trim().min(2).max(100), amount: z.number().int().min(0).max(500_000_000), taxable: z.boolean() });

export const POST = api(async (req, { ctx, params }) => {
  const ref = await getEmployeeForCtx(ctx, params.id, "salary.update");
  if (ctx.employee?.id === params.id) throw new HttpError(403, "Không thể tự điều chỉnh phụ cấp của mình");
  const body = await parseBody(req, schema);
  const a = await prisma.employeeAllowance.create({ data: { employeeId: params.id, ...body } });
  await audit(ctx, { action: "CREATE", entityType: "Employee", entityId: params.id, summary: `Thêm phụ cấp "${body.name}" cho ${ref.fullName}` }, req);
  return { id: a.id };
});

export const DELETE = api(async (req, { ctx, params }) => {
  const ref = await getEmployeeForCtx(ctx, params.id, "salary.update");
  const aid = req.nextUrl.searchParams.get("allowanceId");
  const a = aid ? await prisma.employeeAllowance.findFirst({ where: { id: aid, employeeId: params.id } }) : null;
  if (!a) throw new HttpError(404, "Phụ cấp không tồn tại");
  await prisma.employeeAllowance.delete({ where: { id: a.id } });
  await audit(ctx, { action: "DELETE", entityType: "Employee", entityId: params.id, summary: `Xoá phụ cấp "${a.name}" của ${ref.fullName}` }, req);
  return { ok: true };
});
