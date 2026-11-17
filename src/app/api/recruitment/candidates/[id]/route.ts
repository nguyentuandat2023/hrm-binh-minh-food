import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { getSetting } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import { audit } from "@/lib/audit";

const schema = z.object({
  stage: z.enum(["APPLIED", "SCREENING", "INTERVIEW", "ASSESSMENT", "OFFER", "REJECTED", "WITHDRAWN"]).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});

/** Cập nhật giai đoạn, đánh giá, ghi chú ứng viên. Giai đoạn "Đã tiếp nhận" chỉ qua thao tác Tiếp nhận nhân viên. */
export const PATCH = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "recruitment.update", "COMPANY");
  const c = await prisma.candidate.findUnique({ where: { id: params.id } });
  if (!c) throw new HttpError(404, "Ứng viên không tồn tại");
  if (c.stage === "HIRED") throw new HttpError(409, "Ứng viên đã được tiếp nhận");
  const b = await parseBody(req, schema);
  await prisma.candidate.update({ where: { id: c.id }, data: b });
  await audit(ctx, { action: "UPDATE", entityType: "Candidate", entityId: c.id, summary: `Cập nhật ứng viên ${c.fullName}${b.stage ? ` → ${b.stage}` : ""}`, changes: b.stage ? { stage: { from: c.stage, to: b.stage } } : undefined }, req);
  return { ok: true };
});

/** Sinh nội dung thông báo theo mẫu (để HR sao chép/gửi qua kênh của công ty) */
export const GET = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "recruitment.view", "COMPANY");
  const tpl = req.nextUrl.searchParams.get("template") as "interviewInvite" | "offer" | "rejection";
  if (!["interviewInvite", "offer", "rejection"].includes(tpl)) throw new HttpError(400, "Mẫu không hợp lệ");
  const c = await prisma.candidate.findUnique({ where: { id: params.id }, include: { job: true, interviews: { orderBy: { scheduledAt: "desc" }, take: 1 } } });
  if (!c) throw new HttpError(404, "Ứng viên không tồn tại");
  const [templates, company] = await Promise.all([getSetting("templates"), getSetting("company")]);
  const iv = c.interviews[0];
  const text = templates[tpl]
    .replaceAll("{ten_ung_vien}", c.fullName)
    .replaceAll("{vi_tri}", c.job.title)
    .replaceAll("{ten_cong_ty}", company.name)
    .replaceAll("{thoi_gian}", iv ? fmtDateTime(iv.scheduledAt) : "[thời gian]")
    .replaceAll("{dia_diem}", iv?.location ?? "[địa điểm]");
  return { to: c.email, text };
});
