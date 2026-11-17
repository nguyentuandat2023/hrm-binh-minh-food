import { z } from "zod";
import { prisma } from "@/lib/db";
import { api } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { saveUpload } from "@/lib/storage";
import { audit } from "@/lib/audit";

const schema = z.object({
  jobId: z.string().min(1),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email("Email không hợp lệ").nullable(),
  phone: z.string().trim().regex(/^[0-9+\-\s().]{8,20}$/, "SĐT không hợp lệ").nullable(),
  source: z.string().trim().max(100).nullable(),
  notes: z.string().trim().max(2000).nullable(),
});

/** Thêm ứng viên (multipart: các trường + file CV tuỳ chọn) */
export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "recruitment.create", "COMPANY");
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "Yêu cầu không hợp lệ");
  const s = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const b = schema.parse({ jobId: s("jobId"), fullName: s("fullName"), email: s("email"), phone: s("phone"), source: s("source"), notes: s("notes") });
  const job = await prisma.recruitmentJob.findUnique({ where: { id: b.jobId } });
  if (!job || job.status === "CLOSED") throw new HttpError(400, "Vị trí không tồn tại hoặc đã đóng");
  if (b.email && (await prisma.candidate.findFirst({ where: { jobId: job.id, email: b.email } }))) throw new HttpError(409, "Ứng viên với email này đã có trong vị trí");
  const file = form.get("cv");
  let cvFileId: string | null = null;
  if (file instanceof File && file.size > 0) {
    const stored = await saveUpload(file);
    cvFileId = (await prisma.employeeDocument.create({ data: { category: "CV", uploadedById: ctx.userId, ...stored } })).id;
  }
  const c = await prisma.candidate.create({ data: { ...b, cvFileId } });
  await audit(ctx, { action: "CREATE", entityType: "Candidate", entityId: c.id, summary: `Thêm ứng viên ${b.fullName} cho ${job.code}` }, req);
  return { id: c.id };
});
