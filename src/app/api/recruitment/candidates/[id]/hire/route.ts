import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { dbDate, isDateKey, addDays } from "@/lib/dates";
import { createEmployee } from "@/lib/services/employee";
import { getSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";

const schema = z.object({
  startDate: z.string().refine(isDateKey, "Chọn ngày nhận việc"),
  departmentId: z.string().nullable().optional(),
  positionId: z.string().nullable().optional(),
  branchId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  probationDays: z.number().int().min(0).max(180).default(60),
  mentorId: z.string().nullable().optional(),
});

/** Tiếp nhận ứng viên trúng tuyển: tạo hồ sơ nhân viên (thử việc) + checklist tiếp nhận. Do HR chủ động thực hiện. */
export const POST = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "recruitment.update", "COMPANY");
  requirePerm(ctx, "employee.create", "COMPANY");
  const c = await prisma.candidate.findUnique({ where: { id: params.id }, include: { job: true } });
  if (!c) throw new HttpError(404, "Ứng viên không tồn tại");
  if (c.stage === "HIRED" || c.hiredEmployeeId) throw new HttpError(409, "Ứng viên đã được tiếp nhận");
  if (c.stage !== "OFFER") throw new HttpError(400, "Chỉ tiếp nhận ứng viên ở giai đoạn Đề nghị tuyển dụng");
  const b = await parseBody(req, schema);
  const emp = await createEmployee(
    ctx,
    {
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      departmentId: b.departmentId ?? c.job.departmentId,
      positionId: b.positionId ?? c.job.positionId,
      branchId: b.branchId ?? c.job.branchId,
      managerId: b.managerId ?? null,
      startDate: b.startDate,
      employmentType: "FULL_TIME",
      status: "PROBATION",
      probationEndDate: b.probationDays ? addDays(b.startDate, b.probationDays) : null,
      gender: "UNDISCLOSED",
      confirmDuplicate: true,
    },
    req,
  );
  const tpl = await getSetting("templates");
  await prisma.$transaction(async (tx) => {
    await tx.candidate.update({ where: { id: c.id }, data: { stage: "HIRED", hiredEmployeeId: emp.id } });
    if (c.cvFileId) await tx.employeeDocument.update({ where: { id: c.cvFileId }, data: { employeeId: emp.id } });
    await tx.lifecycleChecklist.create({
      data: {
        type: "ONBOARDING",
        employeeId: emp.id,
        mentorId: b.mentorId ?? null,
        targetDate: b.probationDays ? dbDate(addDays(b.startDate, b.probationDays)) : null,
        createdById: ctx.userId,
        tasks: { create: tpl.onboardingTasks.map((t, i) => ({ title: t.title, category: t.category, sort: i, dueDate: dbDate(addDays(b.startDate, Math.min(i * 3, 30))) })) },
      },
    });
    const hired = await tx.candidate.count({ where: { jobId: c.jobId, stage: "HIRED" } });
    if (hired >= c.job.headcount) await tx.recruitmentJob.update({ where: { id: c.jobId }, data: { status: "CLOSED" } });
    await audit(ctx, { action: "CREATE", entityType: "Candidate", entityId: c.id, summary: `Tiếp nhận ứng viên ${c.fullName} thành nhân viên ${emp.code}` }, req, tx);
  });
  return { employeeId: emp.id, code: emp.code };
});
