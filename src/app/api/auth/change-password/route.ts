import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { getSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";

const schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });

export const POST = api(
  async (req, { ctx }) => {
    const { currentPassword, newPassword } = await parseBody(req, schema);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new HttpError(400, "Mật khẩu hiện tại không đúng");
    if (currentPassword === newPassword) throw new HttpError(400, "Mật khẩu mới phải khác mật khẩu hiện tại");
    const sec = await getSetting("security");
    const weak = validatePasswordStrength(newPassword, sec.passwordMinLength);
    if (weak) throw new HttpError(400, weak);
    await prisma.$transaction([
      prisma.user.update({ where: { id: ctx.userId }, data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false } }),
      // Thu hồi các phiên khác, giữ phiên hiện tại
      prisma.session.updateMany({ where: { userId: ctx.userId, revokedAt: null, NOT: { id: ctx.sessionId } }, data: { revokedAt: new Date() } }),
    ]);
    await audit(ctx, { action: "PASSWORD_CHANGED", entityType: "User", entityId: ctx.userId }, req);
    return { ok: true };
  },
  { allowRestricted: true },
);
