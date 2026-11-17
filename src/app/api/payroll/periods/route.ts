import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { createPeriod } from "@/lib/services/payroll";
import { prisma } from "@/lib/db";

export const GET = api(async (_req, { ctx }) => {
  requirePerm(ctx, "payroll.view", "COMPANY");
  const items = await prisma.payrollPeriod.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { id: true, code: true, name: true, status: true, configId: true, calculatedAt: true, approvedAt: true, lockedAt: true, _count: { select: { records: true } } },
  });
  return { items };
});

const schema = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Chọn tháng") });

export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "payroll.create", "COMPANY");
  const { month } = await parseBody(req, schema);
  const p = await createPeriod(ctx, month, req);
  return { id: p.id };
});
