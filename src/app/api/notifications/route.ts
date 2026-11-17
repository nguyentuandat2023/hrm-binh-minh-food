import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, pageParams, parseBody, searchParams } from "@/lib/api";

/** Thông báo trong ứng dụng của user hiện tại */
export const GET = api(async (req, { ctx }) => {
  const sp = searchParams(req);
  const { page, size, skip, take } = pageParams(sp, 20);
  const where = { userId: ctx.userId, ...(sp.unread === "1" ? { readAt: null } : {}) };
  const [total, unread, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: ctx.userId, readAt: null } }),
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  return { total, unread, page, size, items };
});

const schema = z.union([z.object({ ids: z.array(z.string()).min(1).max(200) }), z.object({ all: z.literal(true) })]);

/** Đánh dấu đã đọc */
export const PATCH = api(async (req, { ctx }) => {
  const b = await parseBody(req, schema);
  const where = "all" in b ? { userId: ctx.userId, readAt: null } : { userId: ctx.userId, id: { in: b.ids } };
  const r = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  return { updated: r.count };
});
