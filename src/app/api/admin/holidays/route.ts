import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { dbDate, isDateKey } from "@/lib/dates";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

const schema = z.object({ date: z.string().refine(isDateKey, "Ngày không hợp lệ"), name: z.string().trim().min(2).max(120), isPaid: z.boolean().default(true) });

export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "leave.update", "COMPANY");
  const b = await parseBody(req, schema);
  const locked = await prisma.payrollPeriod.findFirst({ where: { status: "LOCKED", startDate: { lte: dbDate(b.date) }, endDate: { gte: dbDate(b.date) } } });
  if (locked) throw new HttpError(409, `Kỳ lương ${locked.code} đã khoá`);
  const h = await prisma.holiday.create({ data: { date: dbDate(b.date), name: b.name, isPaid: b.isPaid } });
  await audit(ctx, { action: "CREATE", entityType: "Holiday", entityId: h.id, summary: `Thêm ngày lễ ${b.date} – ${b.name}` }, req);
  return { id: h.id };
});

export const DELETE = api(async (req, { ctx }) => {
  requirePerm(ctx, "leave.update", "COMPANY");
  const id = req.nextUrl.searchParams.get("id");
  const h = id ? await prisma.holiday.findUnique({ where: { id } }) : null;
  if (!h) throw new HttpError(404, "Ngày lễ không tồn tại");
  const locked = await prisma.payrollPeriod.findFirst({ where: { status: "LOCKED", startDate: { lte: h.date }, endDate: { gte: h.date } } });
  if (locked) throw new HttpError(409, `Kỳ lương ${locked.code} đã khoá`);
  await prisma.holiday.delete({ where: { id: h.id } });
  await audit(ctx, { action: "DELETE", entityType: "Holiday", entityId: h.id, summary: `Xoá ngày lễ ${h.name}` }, req);
  return { ok: true };
});
