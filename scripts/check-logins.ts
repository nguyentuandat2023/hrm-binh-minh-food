// Chẩn đoán đăng nhập: các lần đăng nhập gần nhất và tài khoản đang bị khoá tạm.
//   npx tsx scripts/check-logins.ts
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
(async () => {
  const since = new Date(Date.now() - 6 * 3600_000);
  const logs = await prisma.auditLog.findMany({
    where: { action: { in: ["LOGIN", "LOGIN_FAILED", "ACCOUNT_LOCKED", "MFA_FAILED"] }, createdAt: { gte: since } },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  for (const l of logs) console.log(l.createdAt.toISOString(), l.action.padEnd(15), l.user?.email ?? "(email không tồn tại)", l.summary ?? "", l.userAgent?.slice(0, 40) ?? "");
  const locked = await prisma.user.findMany({ where: { OR: [{ lockedUntil: { gt: new Date() } }, { isActive: false }, { failedLoginCount: { gt: 0 } }] }, select: { email: true, lockedUntil: true, isActive: true, failedLoginCount: true } });
  console.log("\nTài khoản có vấn đề:", locked);
  await prisma.$disconnect();
})();
