import "server-only";
import { cookies } from "next/headers";
import { prisma } from "./db";
import type { AuthCtx } from "./rbac";
import { approvalBlockReason } from "./services/approval";

/** Chi nhánh đang chọn ở topbar (chỉ áp dụng cho user có phạm vi toàn công ty) */
export async function selectedBranch(ctx: AuthCtx, permKey: string): Promise<string | null> {
  if (ctx.perms[permKey] !== "COMPANY") return null;
  const v = (await cookies()).get("hrm_branch")?.value;
  return v && /^[a-z0-9]{10,40}$/i.test(v) ? v : null;
}

/** Các yêu cầu đang chờ mà user hiện tại có thể duyệt ở cấp hiện tại */
export async function actionableApprovals(ctx: AuthCtx) {
  if (!ctx.perms["leave.approve"] && !ctx.perms["attendance.approve"]) return [];
  const pending = await prisma.approvalRequest.findMany({
    where: { status: "PENDING" },
    include: {
      steps: { orderBy: { createdAt: "asc" } },
      employee: { select: { id: true, fullName: true, code: true, departmentId: true, branchId: true, managerId: true, avatarFileId: true, department: { select: { name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return pending.filter(
    (a) => approvalBlockReason(ctx, { type: a.type, status: a.status, currentLevel: a.currentLevel, employee: a.employee, priorActors: a.steps.map((s) => s.actorUserId) }) === null,
  );
}
