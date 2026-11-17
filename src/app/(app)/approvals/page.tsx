import { prisma } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { actionableApprovals } from "@/lib/page-ctx";
import { APPROVAL_LABEL } from "@/lib/services/approval";
import { fmtDateTime } from "@/lib/format";
import { REQUEST_STATUS } from "@/lib/labels";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { DecideButtons } from "./decide-buttons";

export const metadata = { title: "Phê duyệt" };

export default async function ApprovalsPage() {
  const ctx = await requirePageAuth();
  if (!ctx.perms["leave.approve"] && !ctx.perms["attendance.approve"]) redirect("/forbidden");
  const [pending, history] = await Promise.all([
    actionableApprovals(ctx),
    prisma.approvalStep.findMany({
      where: { actorUserId: ctx.userId },
      include: { request: { include: { employee: { select: { fullName: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  // Thông tin bổ sung cho đơn nghỉ (đính kèm, số ngày)
  const leaveIds = pending.filter((p) => p.type === "LEAVE").map((p) => p.entityId);
  const leaves = await prisma.leaveRequest.findMany({ where: { id: { in: leaveIds } }, select: { id: true, reason: true, attachmentId: true } });
  const adjIds = pending.filter((p) => p.type === "ATTENDANCE_ADJUSTMENT").map((p) => p.entityId);
  const adjs = await prisma.attendanceAdjustment.findMany({ where: { id: { in: adjIds } }, select: { id: true, reason: true } });
  const otIds = pending.filter((p) => p.type === "OVERTIME").map((p) => p.entityId);
  const ots = await prisma.overtimeRequest.findMany({ where: { id: { in: otIds } }, select: { id: true, reason: true } });
  const detail = (type: string, id: string) =>
    type === "LEAVE" ? leaves.find((l) => l.id === id) : type === "OVERTIME" ? ots.find((o) => o.id === id) : adjs.find((a) => a.id === id);

  return (
    <div className="space-y-5">
      <PageHeader title="Phê duyệt" description="Các yêu cầu bạn có quyền duyệt ở cấp hiện tại. Bạn không thể tự duyệt yêu cầu của chính mình." />
      <Card>
        <CardHeader title={`Đang chờ bạn duyệt (${pending.length})`} />
        {pending.length === 0 ? (
          <EmptyState title="Không có yêu cầu nào chờ bạn duyệt" />
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((a) => {
              const d = detail(a.type, a.entityId) as { reason?: string; attachmentId?: string | null } | undefined;
              return (
                <li key={a.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <Avatar name={a.employee.fullName} fileId={a.employee.avatarFileId} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{a.employee.fullName}</span>
                      <span className="text-xs text-muted-foreground">{a.employee.department?.name}</span>
                      <Badge tone={a.type === "LEAVE" ? "blue" : a.type === "OVERTIME" ? "violet" : "amber"}>{APPROVAL_LABEL[a.type]}</Badge>
                      {a.requiredLevels > 1 && <Badge tone="slate">Cấp {a.currentLevel}/{a.requiredLevels}</Badge>}
                    </div>
                    <p className="mt-1 text-sm">{a.title}</p>
                    {d?.reason && <p className="mt-0.5 text-sm text-muted-foreground">Lý do: {d.reason}</p>}
                    {d?.attachmentId && (
                      <a className="text-xs text-primary hover:underline" href={`/api/files/${d.attachmentId}?inline=1`} target="_blank" rel="noreferrer">
                        Xem tài liệu đính kèm
                      </a>
                    )}
                    {a.steps.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Đã duyệt cấp trước: {a.steps.length} bước</p>}
                    <p className="mt-1 text-xs text-muted-foreground">Gửi lúc {fmtDateTime(a.createdAt)}</p>
                  </div>
                  <DecideButtons id={a.id} />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Bạn đã xử lý gần đây" />
        {history.length === 0 ? (
          <EmptyState title="Chưa có" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Nhân viên</TH>
                <TH>Yêu cầu</TH>
                <TH>Quyết định</TH>
                <TH className="hidden md:table-cell">Thời gian</TH>
              </tr>
            </THead>
            <TBody>
              {history.map((h) => (
                <TR key={h.id}>
                  <TD>{h.request.employee.fullName}</TD>
                  <TD>
                    {APPROVAL_LABEL[h.request.type]}: {h.request.title}
                    {h.comment && <span className="block text-xs text-muted-foreground">“{h.comment}”</span>}
                  </TD>
                  <TD>
                    <Badge tone={REQUEST_STATUS[h.decision].tone}>
                      {REQUEST_STATUS[h.decision].label} (cấp {h.level})
                    </Badge>
                  </TD>
                  <TD className="hidden text-xs md:table-cell">{fmtDateTime(h.createdAt)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
