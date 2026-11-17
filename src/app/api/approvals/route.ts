import { prisma } from "@/lib/db";
import { api, searchParams } from "@/lib/api";
import { actionableApprovals } from "@/lib/page-ctx";

/** GET /api/approvals?scope=mine|actionable – yêu cầu của tôi, hoặc yêu cầu tôi có thể duyệt ở cấp hiện tại */
export const GET = api(async (req, { ctx }) => {
  const scope = searchParams(req).scope ?? "actionable";
  if (scope === "mine") {
    if (!ctx.employee) return { items: [] };
    const items = await prisma.approvalRequest.findMany({
      where: { employeeId: ctx.employee.id },
      select: { id: true, type: true, entityId: true, title: true, status: true, currentLevel: true, requiredLevels: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { items };
  }
  const items = await actionableApprovals(ctx);
  return {
    items: items.map((a) => ({ id: a.id, type: a.type, entityId: a.entityId, title: a.title, status: a.status, currentLevel: a.currentLevel, requiredLevels: a.requiredLevels, createdAt: a.createdAt, employee: { id: a.employee.id, fullName: a.employee.fullName } })),
  };
});
