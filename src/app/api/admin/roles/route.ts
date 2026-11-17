import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  key: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{3,30}$/, "Mã vai trò 3–30 ký tự (A-Z, 0-9, _)"),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable().optional(),
  copyFromRoleId: z.string().nullable().optional(),
});

/** Tạo vai trò tuỳ chỉnh (có thể sao chép quyền từ vai trò có sẵn) */
export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "admin_role.update", "COMPANY");
  const b = await parseBody(req, schema);
  const role = await prisma.$transaction(async (tx) => {
    const r = await tx.role.create({ data: { key: b.key, name: b.name, description: b.description ?? null } });
    if (b.copyFromRoleId) {
      const src = await tx.rolePermission.findMany({ where: { roleId: b.copyFromRoleId } });
      await tx.rolePermission.createMany({ data: src.map((p) => ({ roleId: r.id, permissionId: p.permissionId, scope: p.scope })) });
    }
    return r;
  });
  await audit(ctx, { action: "CREATE", entityType: "Role", entityId: role.id, summary: `Tạo vai trò ${role.name}` }, req);
  return { id: role.id };
});
