// Tạo tài khoản Super Admin đầu tiên một cách an toàn:
//   npm run create-admin -- --email quantri@congty.vn
//   (mật khẩu tự chọn) đặt biến môi trường ADMIN_PASSWORD trước khi chạy – không bắt buộc đổi ở lần đầu
//   (Docker) docker compose run --rm migrate npx tsx scripts/create-admin.ts --email quantri@congty.vn
// - Mật khẩu tạm sinh ngẫu nhiên, chỉ in ra MỘT LẦN trên terminal, bắt buộc đổi khi đăng nhập lần đầu.
// - Từ chối nếu đã có Super Admin đang hoạt động (dùng --force khi thực sự cần khôi phục quyền quản trị).
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedBaseline } from "../prisma/seed-lib";
import { generateTempPassword } from "../src/lib/crypto";

const prisma = new PrismaClient();
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : undefined;
};

(async () => {
  const email = arg("--email")?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Dùng: npm run create-admin -- --email quantri@congty.vn");
    process.exit(1);
  }
  await seedBaseline(prisma);
  const role = await prisma.role.findUniqueOrThrow({ where: { key: "SUPER_ADMIN" } });
  const existing = await prisma.user.count({ where: { isActive: true, roles: { some: { roleId: role.id } } } });
  if (existing > 0 && !process.argv.includes("--force")) {
    console.error(`Đã có ${existing} Super Admin đang hoạt động. Dùng --force nếu cần tạo thêm (thao tác được ghi nhật ký).`);
    process.exit(1);
  }
  // Mật khẩu chỉ định qua biến môi trường ADMIN_PASSWORD (không truyền trên dòng lệnh); nếu không có → sinh ngẫu nhiên, bắt buộc đổi
  const given = process.env.ADMIN_PASSWORD;
  if (given !== undefined) {
    const weak = given.length < 10 ? "tối thiểu 10 ký tự" : !/[a-z]/.test(given) || !/[A-Z]/.test(given) || !/\d/.test(given) ? "cần chữ hoa, chữ thường và chữ số" : null;
    if (weak) {
      console.error(`ADMIN_PASSWORD không đạt chính sách mật khẩu: ${weak}`);
      process.exit(1);
    }
  }
  const temp = given ?? generateTempPassword(16);
  const mustChange = given === undefined;
  const hash = await bcrypt.hash(temp, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash: hash, mustChangePassword: mustChange, roles: { create: [{ roleId: role.id }] } },
    update: { passwordHash: hash, mustChangePassword: mustChange, isActive: true, failedLoginCount: 0, lockedUntil: null },
  });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, create: { userId: user.id, roleId: role.id }, update: {} });
  await prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: null, action: "CREATE", entityType: "User", entityId: user.id, summary: `Tạo/khôi phục Super Admin ${email} bằng công cụ dòng lệnh` } });
  console.log("\n================ TÀI KHOẢN QUẢN TRỊ ================");
  console.log(` Email:          ${email}`);
  if (mustChange) {
    console.log(` Mật khẩu tạm:   ${temp}`);
    console.log(" → Đăng nhập và đổi mật khẩu ngay; bật xác thực hai lớp tại Bảo mật tài khoản.");
    console.log(" → Mật khẩu này không được lưu ở bất kỳ đâu khác.");
  } else {
    console.log(" Mật khẩu:       (theo ADMIN_PASSWORD đã cung cấp – không in ra)");
    console.log(" → Nên bật xác thực hai lớp tại Bảo mật tài khoản.");
  }
  console.log("====================================================\n");
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
