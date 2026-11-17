import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notify";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), employeeId: z.string().min(1, "Chọn nhân viên"), conditionOut: z.string().trim().max(200).nullable().optional(), note: z.string().trim().max(500).nullable().optional() }),
  z.object({ action: z.literal("return"), conditionIn: z.string().trim().min(2, "Ghi tình trạng khi thu hồi").max(200), toStatus: z.enum(["AVAILABLE", "MAINTENANCE", "LOST", "RETIRED"]).default("AVAILABLE"), note: z.string().trim().max(500).nullable().optional() }),
]);

/** Bàn giao / thu hồi tài sản (giao dịch nguyên tử, lưu lịch sử) */
export const POST = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "asset.update", "COMPANY");
  const b = await parseBody(req, schema);
  const a = await prisma.asset.findUnique({ where: { id: params.id } });
  if (!a) throw new HttpError(404, "Tài sản không tồn tại");
  if (b.action === "assign") {
    if (a.status !== "AVAILABLE") throw new HttpError(409, "Tài sản không ở trạng thái sẵn sàng");
    const emp = await prisma.employee.findUnique({ where: { id: b.employeeId }, select: { id: true, fullName: true, deactivatedAt: true, status: true } });
    if (!emp || emp.deactivatedAt || emp.status === "RESIGNED") throw new HttpError(400, "Nhân viên không hợp lệ");
    const asg = await prisma.$transaction(async (tx) => {
      const upd = await tx.asset.updateMany({ where: { id: a.id, status: "AVAILABLE" }, data: { status: "ASSIGNED", currentHolderId: emp.id, condition: b.conditionOut ?? a.condition } });
      if (upd.count !== 1) throw new HttpError(409, "Tài sản vừa được bàn giao cho người khác");
      const r = await tx.assetAssignment.create({ data: { assetId: a.id, employeeId: emp.id, conditionOut: b.conditionOut ?? null, note: b.note ?? null, assignedById: ctx.userId } });
      await audit(ctx, { action: "UPDATE", entityType: "Asset", entityId: a.id, summary: `Bàn giao ${a.code} cho ${emp.fullName}` }, req, tx);
      return r;
    });
    await notifyEmployee(emp.id, { type: "ASSET", title: "Bạn được bàn giao tài sản", body: `${a.code} – ${a.name}`, link: "/me?tab=assets" });
    return { assignmentId: asg.id };
  }
  if (a.status !== "ASSIGNED" || !a.currentHolderId) throw new HttpError(409, "Tài sản không ở trạng thái đang sử dụng");
  const open = await prisma.assetAssignment.findFirst({ where: { assetId: a.id, returnedAt: null }, orderBy: { assignedAt: "desc" } });
  await prisma.$transaction(async (tx) => {
    if (open) await tx.assetAssignment.update({ where: { id: open.id }, data: { returnedAt: new Date(), conditionIn: b.conditionIn, receivedById: ctx.userId, note: b.note ?? open.note } });
    await tx.asset.update({ where: { id: a.id }, data: { status: b.toStatus, currentHolderId: null, condition: b.conditionIn } });
    await audit(ctx, { action: "UPDATE", entityType: "Asset", entityId: a.id, summary: `Thu hồi ${a.code} (${b.conditionIn})` }, req, tx);
  });
  return { ok: true, assignmentId: open?.id };
});
