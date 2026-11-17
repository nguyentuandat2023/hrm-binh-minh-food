// Dùng sau khi nâng cấp phiên bản có thêm quyền mới:
//   npx tsx scripts/sync-permissions.ts            → chỉ liệt kê quyền mặc định còn thiếu
//   npx tsx scripts/sync-permissions.ts --apply    → THÊM các quyền còn thiếu cho vai trò hệ thống
// Không sửa phạm vi đã có, không xoá quyền đã tuỳ chỉnh.
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ROLE_MATRIX, MODULES } from "../src/lib/permissions";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

(async () => {
  for (const m of MODULES) {
    for (const [action, description] of Object.entries(m.actions)) {
      const key = `${m.key}.${action}`;
      await prisma.permission.upsert({ where: { key }, create: { key, module: m.key, action, description: description! }, update: { description: description! } });
    }
  }
  const perms = new Map((await prisma.permission.findMany()).map((p) => [p.key, p.id]));
  const missing: string[] = [];
  for (const role of await prisma.role.findMany({ where: { isSystem: true } })) {
    for (const [key, scope] of Object.entries(DEFAULT_ROLE_MATRIX[role.key] ?? {})) {
      const pid = perms.get(key)!;
      const exists = await prisma.rolePermission.findUnique({ where: { roleId_permissionId: { roleId: role.id, permissionId: pid } } });
      if (exists) continue;
      missing.push(`${role.key}: ${key} (${scope})`);
      if (apply) await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: pid, scope } });
    }
  }
  console.log(missing.length ? missing.join("\n") : "Không thiếu quyền mặc định nào.");
  console.log(apply ? `Đã thêm ${missing.length} quyền.` : missing.length ? "Chạy lại với --apply để thêm." : "");
  await prisma.$disconnect();
})();
