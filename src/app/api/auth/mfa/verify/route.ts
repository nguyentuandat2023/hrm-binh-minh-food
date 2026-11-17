import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseBody, publicApi, rateLimit } from "@/lib/api";
import { getSessionState } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { decrypt } from "@/lib/crypto";
import { verifyTotp } from "@/lib/totp";
import { audit } from "@/lib/audit";

const schema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Mã gồm 6 chữ số") });

export const POST = publicApi(async (req) => {
  const state = await getSessionState();
  if (state.status !== "mfa_pending") throw new HttpError(401, "Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại");
  if (!rateLimit(`mfa:${state.sessionId}`, 6, 5 * 60_000)) {
    await prisma.session.update({ where: { id: state.sessionId }, data: { revokedAt: new Date() } });
    throw new HttpError(429, "Nhập sai quá nhiều lần. Vui lòng đăng nhập lại.");
  }
  const { code } = await parseBody(req, schema);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: state.userId } });
  const secret = decrypt(user.totpSecretEnc);
  if (!secret || !verifyTotp(secret, code)) {
    await audit({ userId: user.id }, { action: "MFA_FAILED", entityType: "User", entityId: user.id }, req);
    throw new HttpError(400, "Mã xác thực không đúng");
  }
  await prisma.session.update({ where: { id: state.sessionId }, data: { mfaVerified: true } });
  await audit({ userId: user.id }, { action: "MFA_VERIFIED", entityType: "User", entityId: user.id }, req);
  return { ok: true, mustChangePassword: user.mustChangePassword };
});
