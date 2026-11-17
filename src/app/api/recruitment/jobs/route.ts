import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { dbDate, isDateKey } from "@/lib/dates";
import { HttpError } from "@/lib/errors";
import { nextCode } from "@/lib/sequence";
import { audit } from "@/lib/audit";

const schema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(3).max(150),
  departmentId: z.string().nullable().optional(),
  positionId: z.string().nullable().optional(),
  branchId: z.string().nullable().optional(),
  headcount: z.number().int().min(1).max(500),
  salaryRange: z.string().trim().max(100).nullable().optional(),
  deadline: z.string().refine(isDateKey).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  requirements: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["DRAFT", "OPEN", "ON_HOLD", "CLOSED"]).default("DRAFT"),
});

/** Tạo hoặc cập nhật (có id) vị trí tuyển dụng */
export const POST = api(async (req, { ctx }) => {
  const { id, deadline, ...b } = await parseBody(req, schema);
  const data = { ...b, deadline: deadline ? dbDate(deadline) : null, departmentId: b.departmentId ?? null, positionId: b.positionId ?? null, branchId: b.branchId ?? null };
  if (id) {
    requirePerm(ctx, b.status === "CLOSED" ? "recruitment.delete" : "recruitment.update", "COMPANY");
    if (!(await prisma.recruitmentJob.findUnique({ where: { id } }))) throw new HttpError(404, "Vị trí không tồn tại");
    await prisma.recruitmentJob.update({ where: { id }, data });
    await audit(ctx, { action: "UPDATE", entityType: "RecruitmentJob", entityId: id, summary: `Cập nhật vị trí tuyển dụng ${b.title}` }, req);
    return { id };
  }
  requirePerm(ctx, "recruitment.create", "COMPANY");
  const code = await nextCode("job", "TD-");
  const j = await prisma.recruitmentJob.create({ data: { ...data, code } });
  await audit(ctx, { action: "CREATE", entityType: "RecruitmentJob", entityId: j.id, summary: `Tạo vị trí tuyển dụng ${code} – ${b.title}` }, req);
  return { id: j.id };
});
