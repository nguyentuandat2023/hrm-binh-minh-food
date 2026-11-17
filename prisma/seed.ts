// Dữ liệu nền (an toàn khi chạy lặp lại) + tuỳ chọn khởi tạo lần đầu qua biến môi trường:
//   INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD  → tạo Super Admin nếu hệ thống CHƯA có Super Admin nào
//   INITIAL_COMPANY_NAME / INITIAL_COMPANY_SHORT_NAME → tên công ty nếu chưa cấu hình
// Dùng cho nền tảng không có cửa sổ lệnh (Railway…). Sau khi đăng nhập được, nên xoá INITIAL_ADMIN_PASSWORD.
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedBaseline } from "./seed-lib";

const prisma = new PrismaClient();

async function initialAdmin() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!email || !password) return;
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  const existing = await prisma.user.count({ where: { isActive: true, roles: { some: { roleId: role.id } } } });
  if (existing > 0) {
    console.log("ℹ Đã có Super Admin – bỏ qua INITIAL_ADMIN_* (có thể xoá các biến này).");
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("INITIAL_ADMIN_EMAIL không hợp lệ");
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error("INITIAL_ADMIN_PASSWORD cần tối thiểu 10 ký tự, có chữ hoa, chữ thường và chữ số");
  }
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash: await bcrypt.hash(password, 12), roles: { create: [{ roleId: role.id }] } },
    update: { passwordHash: await bcrypt.hash(password, 12), isActive: true, failedLoginCount: 0, lockedUntil: null },
  });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, create: { userId: user.id, roleId: role.id }, update: {} });
  await prisma.auditLog.create({ data: { action: "CREATE", entityType: "User", entityId: user.id, summary: `Khởi tạo Super Admin ${email} từ biến môi trường` } });
  console.log(`✔ Đã tạo Super Admin ${email}`);
}

async function initialCompany() {
  const name = process.env.INITIAL_COMPANY_NAME?.trim();
  const shortName = process.env.INITIAL_COMPANY_SHORT_NAME?.trim();
  if (!name && !shortName) return;
  if (await prisma.companySetting.findUnique({ where: { key: "company" } })) return;
  await prisma.companySetting.create({ data: { key: "company", value: { name: name || shortName, shortName: shortName ?? "" } } });
  console.log(`✔ Đã đặt tên công ty: ${shortName || name}`);
}

(async () => {
  await seedBaseline(prisma);
  console.log("✔ Đã tạo dữ liệu nền (quyền, vai trò, loại nghỉ, ca, cấu hình mẫu).");
  await initialCompany();
  await initialAdmin();
})()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
