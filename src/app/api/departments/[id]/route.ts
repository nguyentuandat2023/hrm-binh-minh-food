import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { audit, diff } from "@/lib/audit";
import { HttpError } from "@/lib/errors";
import { deptSchema } from "@/lib/validators/org";

const patchSchema = deptSchema.partial().extend({ isActive: z.boolean().optional() });

export const PATCH = api(async (req, { ctx, params }) => {
  const b = await parseBody(req, patchSchema);
  requirePerm(ctx, b.isActive === false ? "org.delete" : "org.update", "COMPANY");
  const d = await prisma.department.findUnique({ where: { id: params.id } });
  if (!d) throw new HttpError(404, "Phòng ban không tồn tại");
  if (b.parentId) {
    // Chống vòng lặp cây phòng ban
    let cur: string | null = b.parentId;
    for (let i = 0; cur && i < 100; i++) {
      if (cur === d.id) throw new HttpError(400, "Phòng ban cha không hợp lệ (tạo vòng lặp)");
      cur = (await prisma.department.findUnique({ where: { id: cur }, select: { parentId: true } }))?.parentId ?? null;
    }
  }
  if (b.headId && b.headId !== d.headId) {
    const taken = await prisma.department.findUnique({ where: { headId: b.headId }, select: { name: true, id: true } });
    if (taken && taken.id !== d.id) throw new HttpError(409, `Nhân viên này đang là trưởng phòng ${taken.name}`);
  }
  if (b.isActive === false) {
    const count = await prisma.employee.count({ where: { departmentId: d.id, deactivatedAt: null, status: { not: "RESIGNED" } } });
    if (count) throw new HttpError(409, `Phòng ban còn ${count} nhân viên – hãy chuyển nhân viên sang phòng khác trước`);
    const children = await prisma.department.count({ where: { parentId: d.id, isActive: true } });
    if (children) throw new HttpError(409, `Phòng ban còn ${children} phòng ban con đang hoạt động`);
  }
  const updated = await prisma.department.update({ where: { id: d.id }, data: b });
  await audit(ctx, { action: b.isActive === false ? "DEACTIVATE" : "UPDATE", entityType: "Department", entityId: d.id, summary: `Cập nhật phòng ban ${d.name}`, changes: diff(d as never, b as never) }, req);
  return { id: updated.id };
});
