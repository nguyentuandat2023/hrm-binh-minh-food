import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

const schema = z.object({
  employeeId: z.string().min(1, "Chọn nhân viên"),
  type: z.enum(["BONUS", "COMMISSION", "ALLOWANCE", "DEDUCTION", "ADVANCE"]),
  amount: z.number().int().positive("Số tiền phải lớn hơn 0").max(2_000_000_000),
  taxable: z.boolean().default(true),
  note: z.string().trim().max(200).nullable().optional(),
});

async function openPeriod(id: string) {
  const p = await prisma.payrollPeriod.findUnique({ where: { id } });
  if (!p) throw new HttpError(404, "Kỳ lương không tồn tại");
  if (p.status === "APPROVED" || p.status === "LOCKED") throw new HttpError(409, "Kỳ lương đã duyệt/khoá – không thể sửa khoản điều chỉnh");
  return p;
}

/** Nhập thưởng, hoa hồng, phụ cấp khác, khấu trừ, tạm ứng cho kỳ lương (cần tính lại sau khi nhập) */
export const POST = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "payroll.create", "COMPANY");
  const p = await openPeriod(params.id);
  const b = await parseBody(req, schema);
  const a = await prisma.payrollAdjustment.create({ data: { periodId: p.id, ...b, note: b.note ?? null, createdById: ctx.userId } });
  if (p.status === "CALCULATED") await prisma.payrollPeriod.update({ where: { id: p.id }, data: { status: "DRAFT" } });
  await audit(ctx, { action: "CREATE", entityType: "PayrollAdjustment", entityId: a.id, summary: `Thêm khoản ${b.type} vào ${p.name}` }, req);
  return { id: a.id };
});

export const DELETE = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "payroll.create", "COMPANY");
  const p = await openPeriod(params.id);
  const id = req.nextUrl.searchParams.get("adjId");
  const a = id ? await prisma.payrollAdjustment.findFirst({ where: { id, periodId: p.id } }) : null;
  if (!a) throw new HttpError(404, "Khoản điều chỉnh không tồn tại");
  await prisma.payrollAdjustment.delete({ where: { id: a.id } });
  if (p.status === "CALCULATED") await prisma.payrollPeriod.update({ where: { id: p.id }, data: { status: "DRAFT" } });
  await audit(ctx, { action: "DELETE", entityType: "PayrollAdjustment", entityId: a.id, summary: `Xoá khoản ${a.type} khỏi ${p.name}` }, req);
  return { ok: true };
});
