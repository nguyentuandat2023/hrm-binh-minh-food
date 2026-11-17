import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { dbDate, isDateKey } from "@/lib/dates";
import { payrollParamsSchema } from "@/lib/payroll-calc";
import { audit } from "@/lib/audit";

const schema = z.object({
  copyFromId: z.string(),
  name: z.string().trim().min(3).max(120),
  effectiveFrom: z.string().refine(isDateKey, "Ngày hiệu lực không hợp lệ"),
});

export const GET = api(async (_req, { ctx }) => {
  requirePerm(ctx, "payroll.update", "COMPANY");
  return { items: await prisma.payrollConfig.findMany({ orderBy: { version: "desc" }, select: { id: true, version: true, name: true, status: true, effectiveFrom: true, verifiedAt: true } }) };
});

/** Tạo phiên bản cấu hình mới (bản nháp) bằng cách sao chép một phiên bản có sẵn */
export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "payroll.update", "COMPANY");
  const b = await parseBody(req, schema);
  const src = await prisma.payrollConfig.findUnique({ where: { id: b.copyFromId } });
  if (!src) throw new HttpError(404, "Phiên bản gốc không tồn tại");
  const params = payrollParamsSchema.parse(src.params);
  const last = await prisma.payrollConfig.findFirst({ orderBy: { version: "desc" } });
  const c = await prisma.payrollConfig.create({
    data: { version: (last?.version ?? 0) + 1, name: b.name, effectiveFrom: dbDate(b.effectiveFrom), params: params as object, status: "DRAFT", createdById: ctx.userId },
  });
  await audit(ctx, { action: "CREATE", entityType: "PayrollConfig", entityId: c.id, summary: `Tạo cấu hình lương v${c.version} từ v${src.version}` }, req);
  return { id: c.id };
});
