import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { decideApproval, cancelApprovalByEntity } from "@/lib/services/approval";
import { cancelLeave } from "@/lib/services/leave";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

const schema = z.object({ decision: z.enum(["APPROVED", "REJECTED", "CANCEL"]), comment: z.string().trim().max(1000).optional() });

/** Duyệt / từ chối (người duyệt) hoặc huỷ (người gửi) một yêu cầu */
export const POST = api(async (req, { ctx, params }) => {
  const b = await parseBody(req, schema);
  if (b.decision !== "CANCEL") {
    await decideApproval(ctx, params.id, b.decision, b.comment, req);
    return { ok: true };
  }
  const a = await prisma.approvalRequest.findUnique({ where: { id: params.id } });
  if (!a) throw new HttpError(404, "Yêu cầu không tồn tại");
  if (a.type === "LEAVE") {
    await cancelLeave(ctx, a.entityId, req);
    return { ok: true };
  }
  if (a.employeeId !== ctx.employee?.id) throw new HttpError(403, "Chỉ người gửi mới có thể huỷ yêu cầu");
  if (a.status !== "PENDING") throw new HttpError(409, "Chỉ huỷ được yêu cầu đang chờ duyệt");
  await prisma.$transaction(async (tx) => {
    if (a.type === "OVERTIME") await tx.overtimeRequest.update({ where: { id: a.entityId }, data: { status: "CANCELLED", decidedAt: new Date() } });
    else await tx.attendanceAdjustment.update({ where: { id: a.entityId }, data: { status: "CANCELLED", decidedAt: new Date() } });
    await cancelApprovalByEntity(tx, a.type, a.entityId, ctx.userId);
    await audit(ctx, { action: "CANCEL", entityType: a.type, entityId: a.entityId, summary: `Huỷ yêu cầu: ${a.title}` }, req, tx);
  });
  return { ok: true };
});
