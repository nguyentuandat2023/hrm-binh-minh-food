import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

const create = z.object({
  scheduledAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Thời gian không hợp lệ"),
  durationMin: z.number().int().min(15).max(480).default(60),
  location: z.string().trim().max(200).nullable().optional(),
  interviewers: z.string().trim().max(300).nullable().optional(),
});
const update = z.object({
  interviewId: z.string(),
  result: z.enum(["PENDING", "PASS", "FAIL"]),
  score: z.number().int().min(0).max(10).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

/** Lên lịch phỏng vấn. scheduledAt nhận dạng "YYYY-MM-DDTHH:mm" theo giờ Việt Nam. */
export const POST = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "recruitment.update", "COMPANY");
  const c = await prisma.candidate.findUnique({ where: { id: params.id } });
  if (!c) throw new HttpError(404, "Ứng viên không tồn tại");
  const b = await parseBody(req, create);
  const at = /[zZ]|[+-]\d{2}:\d{2}$/.test(b.scheduledAt) ? new Date(b.scheduledAt) : new Date(b.scheduledAt + ":00+07:00");
  const iv = await prisma.interview.create({ data: { candidateId: c.id, scheduledAt: at, durationMin: b.durationMin, location: b.location ?? null, interviewers: b.interviewers ?? null } });
  if (c.stage === "APPLIED" || c.stage === "SCREENING") await prisma.candidate.update({ where: { id: c.id }, data: { stage: "INTERVIEW" } });
  await audit(ctx, { action: "CREATE", entityType: "Interview", entityId: iv.id, summary: `Lên lịch phỏng vấn ${c.fullName}` }, req);
  return { id: iv.id };
});

/** Ghi kết quả / ghi chú phỏng vấn */
export const PATCH = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "recruitment.update", "COMPANY");
  const b = await parseBody(req, update);
  const iv = await prisma.interview.findFirst({ where: { id: b.interviewId, candidateId: params.id } });
  if (!iv) throw new HttpError(404, "Buổi phỏng vấn không tồn tại");
  await prisma.interview.update({ where: { id: iv.id }, data: { result: b.result, score: b.score ?? null, notes: b.notes ?? null } });
  await audit(ctx, { action: "UPDATE", entityType: "Interview", entityId: iv.id, summary: `Ghi kết quả phỏng vấn: ${b.result}` }, req);
  return { ok: true };
});
