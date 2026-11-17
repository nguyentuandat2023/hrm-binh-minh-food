import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { audit, diff } from "@/lib/audit";
import { buildSearchText } from "@/lib/services/employee";

const phone = z.string().trim().regex(/^[0-9+\-\s().]{8,20}$/, "Số điện thoại không hợp lệ").nullable().optional();
/** Nhân viên chỉ được tự cập nhật: SĐT, địa chỉ, liên hệ khẩn cấp */
const schema = z.object({
  phone,
  address: z.string().trim().max(300).nullable().optional(),
  emergencyName: z.string().trim().max(120).nullable().optional(),
  emergencyPhone: phone,
  emergencyRelation: z.string().trim().max(60).nullable().optional(),
});

export const PATCH = api(async (req, { ctx }) => {
  requirePerm(ctx, "employee_private.update");
  if (!ctx.employee) throw new HttpError(400, "Tài khoản chưa liên kết hồ sơ nhân viên");
  const b = await parseBody(req, schema);
  const before = await prisma.employee.findUniqueOrThrow({ where: { id: ctx.employee.id } });
  const data = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
  const merged = { ...before, ...data };
  await prisma.employee.update({ where: { id: before.id }, data: { ...data, searchText: buildSearchText(merged) } });
  await audit(ctx, { action: "UPDATE", entityType: "Employee", entityId: before.id, summary: "Nhân viên tự cập nhật thông tin liên hệ", changes: diff(before as never, data) }, req);
  return { ok: true };
});
