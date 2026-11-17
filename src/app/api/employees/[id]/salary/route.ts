import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { getEmployeeForCtx } from "@/lib/services/employee";
import { encrypt } from "@/lib/crypto";
import { dbDate, isDateKey } from "@/lib/dates";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

const schema = z.object({
  payType: z.enum(["MONTHLY", "DAILY", "HOURLY"]),
  baseSalary: z.number().int().min(0).max(2_000_000_000),
  insuranceSalary: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
  dependents: z.number().int().min(0).max(20).default(0),
  bankName: z.string().trim().max(120).nullable().optional(),
  bankAccount: z
    .string()
    .trim()
    .regex(/^[0-9]{6,20}$/, "Số tài khoản 6–20 chữ số")
    .nullable()
    .optional(),
  bankAccountName: z.string().trim().max(120).nullable().optional(),
  effectiveDate: z.string().refine(isDateKey, "Ngày hiệu lực không hợp lệ").optional(),
  reason: z.string().trim().max(500).optional(),
});

/** Cập nhật thông tin lương. Thay đổi lương cơ bản bắt buộc có ngày hiệu lực + lý do và được lưu lịch sử. */
export const PUT = api(async (req, { ctx, params }) => {
  const ref = await getEmployeeForCtx(ctx, params.id, "salary.update");
  if (ctx.employee?.id === params.id) throw new HttpError(403, "Không thể tự điều chỉnh lương của chính mình");
  const body = await parseBody(req, schema);
  const current = await prisma.salaryProfile.findUnique({ where: { employeeId: params.id } });
  const salaryChanged = (current?.baseSalary ?? 0) !== body.baseSalary;
  if (salaryChanged && current && (!body.effectiveDate || !body.reason || body.reason.length < 3)) {
    throw new HttpError(400, "Điều chỉnh lương cơ bản cần ngày hiệu lực và lý do");
  }
  await prisma.$transaction(async (tx) => {
    const data = {
      payType: body.payType,
      baseSalary: body.baseSalary,
      insuranceSalary: body.insuranceSalary ?? null,
      dependents: body.dependents,
      bankName: body.bankName ?? null,
      bankAccountName: body.bankAccountName ?? null,
      ...(body.bankAccount !== undefined ? { bankAccountEnc: encrypt(body.bankAccount) } : {}),
    };
    await tx.salaryProfile.upsert({ where: { employeeId: params.id }, create: { employeeId: params.id, ...data }, update: data });
    if (salaryChanged && current) {
      await tx.salaryAdjustment.create({
        data: { employeeId: params.id, effectiveDate: dbDate(body.effectiveDate!), oldSalary: current.baseSalary, newSalary: body.baseSalary, reason: body.reason!, createdById: ctx.userId },
      });
    }
    await audit(ctx, { action: "UPDATE", entityType: "Employee", entityId: params.id, summary: `Cập nhật thông tin lương của ${ref.fullName}${salaryChanged ? " (điều chỉnh lương cơ bản)" : ""}`, changes: { salary: "changed" } }, req, tx);
  });
  return { ok: true };
});
