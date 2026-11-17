import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { assertEmployeeAccess, requirePerm } from "@/lib/rbac";
import { addDays, dbDate, isDateKey, vnDateKey } from "@/lib/dates";
import { HttpError } from "@/lib/errors";
import { getSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notify";

const schema = z.object({
  type: z.enum(["ONBOARDING", "OFFBOARDING"]),
  employeeId: z.string().min(1, "Chọn nhân viên"),
  mentorId: z.string().nullable().optional(),
  targetDate: z.string().refine(isDateKey, "Ngày không hợp lệ").nullable().optional(),
  reason: z.string().trim().max(1000).nullable().optional(),
});

/** Tạo checklist tiếp nhận / nghỉ việc từ mẫu cấu hình */
export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "lifecycle.create");
  const b = await parseBody(req, schema);
  const emp = await prisma.employee.findUnique({ where: { id: b.employeeId }, select: { id: true, departmentId: true, branchId: true, managerId: true, fullName: true } });
  if (!emp) throw new HttpError(404, "Nhân viên không tồn tại");
  assertEmployeeAccess(ctx, "lifecycle.create", emp);
  if (b.type === "OFFBOARDING" && !b.targetDate) throw new HttpError(400, "Nhập ngày làm việc cuối cùng");
  const open = await prisma.lifecycleChecklist.findFirst({ where: { employeeId: emp.id, type: b.type, status: "IN_PROGRESS" } });
  if (open) throw new HttpError(409, "Nhân viên đã có checklist cùng loại đang thực hiện");
  const tpl = await getSetting("templates");
  const tasks = b.type === "ONBOARDING" ? tpl.onboardingTasks : tpl.offboardingTasks;
  const base = b.targetDate ?? vnDateKey();
  const c = await prisma.lifecycleChecklist.create({
    data: {
      type: b.type,
      employeeId: emp.id,
      mentorId: b.mentorId ?? null,
      targetDate: b.targetDate ? dbDate(b.targetDate) : null,
      reason: b.reason ?? null,
      createdById: ctx.userId,
      tasks: { create: tasks.map((t, i) => ({ title: t.title, category: t.category, sort: i, dueDate: dbDate(b.type === "OFFBOARDING" ? base : addDays(base, Math.min(i * 3, 30))) })) },
    },
  });
  await audit(ctx, { action: "CREATE", entityType: "LifecycleChecklist", entityId: c.id, summary: `Tạo checklist ${b.type === "ONBOARDING" ? "tiếp nhận" : "nghỉ việc"} cho ${emp.fullName}` }, req);
  if (b.mentorId) await notifyEmployee(b.mentorId, { type: "MENTOR", title: "Bạn được phân công hướng dẫn nhân viên mới", body: emp.fullName, link: `/lifecycle/${c.id}` });
  return { id: c.id };
});
