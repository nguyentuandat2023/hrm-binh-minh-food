import { z } from "zod";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { isRateLimited, parseBody, publicApi, recordHit } from "@/lib/api";
import { clientIp, createSession, verifyPassword } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { getSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Email không hợp lệ").max(200), password: z.string().min(1, "Nhập mật khẩu").max(200) });

// Chỉ đếm lần đăng nhập SAI. Giới hạn theo IP khi biết IP thật (qua reverse proxy);
// nếu không biết IP thì không gộp mọi người vào chung một hạn mức – mỗi tài khoản vẫn bị khoá tạm sau N lần sai.
const FAIL_WINDOW = 10 * 60_000;
const FAILS_PER_IP = 30;
const FAILS_GLOBAL = 500; // chốt an toàn khi bị dò mật khẩu hàng loạt mà không xác định được IP

export const POST = publicApi(async (req) => {
  const ip = clientIp(await headers());
  const ipKey = ip ? `login-fail:${ip}` : null;
  if ((ipKey && isRateLimited(ipKey, FAILS_PER_IP)) || isRateLimited("login-fail:all", FAILS_GLOBAL)) {
    throw new HttpError(429, "Quá nhiều lần đăng nhập sai. Vui lòng đợi vài phút rồi thử lại.");
  }
  const { email, password } = await parseBody(req, schema);
  const sec = await getSetting("security");
  const user = await prisma.user.findUnique({ where: { email } });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new HttpError(423, `Tài khoản tạm khoá do đăng nhập sai nhiều lần. Thử lại sau ${mins} phút.`);
  }
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!ok || !user) {
    if (ipKey) recordHit(ipKey, FAIL_WINDOW);
    recordHit("login-fail:all", FAIL_WINDOW);
    if (user) {
      const count = user.failedLoginCount + 1;
      const lock = count >= sec.lockoutThreshold;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: lock ? 0 : count, lockedUntil: lock ? new Date(Date.now() + sec.lockoutMinutes * 60_000) : null },
      });
      await audit({ userId: user.id }, { action: lock ? "ACCOUNT_LOCKED" : "LOGIN_FAILED", entityType: "User", entityId: user.id, summary: lock ? "Tạm khoá do sai mật khẩu nhiều lần" : "Sai mật khẩu" }, req);
    } else {
      await audit(null, { action: "LOGIN_FAILED", summary: "Email không tồn tại" }, req);
    }
    throw new HttpError(401, "Email hoặc mật khẩu không đúng");
  }
  if (!user.isActive) throw new HttpError(403, "Tài khoản đã bị khoá. Vui lòng liên hệ quản trị viên.");

  await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await createSession(user.id, !user.totpEnabled);
  await audit({ userId: user.id }, { action: "LOGIN", entityType: "User", entityId: user.id, summary: user.totpEnabled ? "Đăng nhập (chờ MFA)" : "Đăng nhập" }, req);
  return { mfaRequired: user.totpEnabled, mustChangePassword: user.mustChangePassword };
});
