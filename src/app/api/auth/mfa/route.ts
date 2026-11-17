// Thiết lập / bật / tắt xác thực hai lớp (TOTP) cho tài khoản hiện tại.
// Mọi thao tác đều là POST để được kiểm tra chống CSRF.
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { verifyPassword } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";
import { HttpError } from "@/lib/errors";
import { getSetting } from "@/lib/settings";
import { PRIVILEGED_ROLES } from "@/lib/permissions";
import { audit } from "@/lib/audit";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("enable"), code: z.string().regex(/^\d{6}$/, "Mã gồm 6 chữ số") }),
  z.object({ action: z.literal("disable"), password: z.string().min(1, "Nhập mật khẩu"), code: z.string().regex(/^\d{6}$/, "Mã gồm 6 chữ số") }),
]);

export const POST = api(
  async (req, { ctx }) => {
    const body = await parseBody(req, schema);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });

    if (body.action === "setup") {
      if (user.totpEnabled) throw new HttpError(409, "Xác thực hai lớp đã được bật");
      const secret = generateTotpSecret();
      await prisma.user.update({ where: { id: ctx.userId }, data: { totpSecretEnc: encrypt(secret) } });
      const company = await getSetting("company");
      const url = otpauthUrl(secret, ctx.email, company.shortName || "HRM");
      return { secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
    }

    const secret = decrypt(user.totpSecretEnc);
    if (body.action === "enable") {
      if (user.totpEnabled) throw new HttpError(409, "Xác thực hai lớp đã được bật");
      if (!secret) throw new HttpError(400, "Chưa tạo mã thiết lập, vui lòng bấm \"Bắt đầu thiết lập\"");
      if (!verifyTotp(secret, body.code)) throw new HttpError(400, "Mã xác thực không đúng – kiểm tra giờ trên điện thoại");
      await prisma.$transaction([
        prisma.user.update({ where: { id: ctx.userId }, data: { totpEnabled: true } }),
        prisma.session.update({ where: { id: ctx.sessionId }, data: { mfaVerified: true } }),
      ]);
      await audit(ctx, { action: "MFA_ENABLED", entityType: "User", entityId: ctx.userId }, req);
      return { ok: true };
    }

    const sec = await getSetting("security");
    if (sec.requireMfaForPrivileged && ctx.roleKeys.some((r) => PRIVILEGED_ROLES.includes(r))) {
      throw new HttpError(403, "Chính sách công ty bắt buộc tài khoản đặc quyền bật xác thực hai lớp");
    }
    if (!(await verifyPassword(body.password, user.passwordHash))) throw new HttpError(400, "Mật khẩu không đúng");
    if (!secret || !verifyTotp(secret, body.code)) throw new HttpError(400, "Mã xác thực không đúng");
    await prisma.user.update({ where: { id: ctx.userId }, data: { totpEnabled: false, totpSecretEnc: null } });
    await audit(ctx, { action: "MFA_DISABLED", entityType: "User", entityId: ctx.userId }, req);
    return { ok: true };
  },
  { allowRestricted: true },
);
