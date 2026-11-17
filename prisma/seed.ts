import { PrismaClient } from "@prisma/client";
import { seedBaseline } from "./seed-lib";

const prisma = new PrismaClient();
seedBaseline(prisma)
  .then(() => console.log("✔ Đã tạo dữ liệu nền (quyền, vai trò, loại nghỉ, ca, cấu hình mẫu)."))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
