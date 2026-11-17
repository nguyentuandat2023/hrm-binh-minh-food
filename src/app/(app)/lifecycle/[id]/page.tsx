import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can, canAccessEmployee } from "@/lib/rbac";
import { orgOptions } from "@/lib/options";
import { fmtDate } from "@/lib/format";
import { TASK_CATEGORY, ASSET_CATEGORY } from "@/lib/labels";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Notice, PageHeader } from "@/components/ui/misc";
import { FormDialog } from "@/components/form-dialog";
import { CompleteChecklist, TaskToggle } from "./lifecycle-client";

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePerm("lifecycle.view");
  const { id } = await params;
  const c = await prisma.lifecycleChecklist.findUnique({
    where: { id },
    include: {
      employee: { select: { id: true, fullName: true, code: true, status: true, departmentId: true, branchId: true, managerId: true, department: { select: { name: true } }, user: { select: { isActive: true } } } },
      mentor: { select: { id: true, fullName: true } },
      tasks: { include: { assignee: { select: { fullName: true } } }, orderBy: { sort: "asc" } },
    },
  });
  if (!c) notFound();
  if (!canAccessEmployee(ctx, "lifecycle.view", c.employee) && !c.tasks.some((t) => t.assigneeId === ctx.employee?.id)) redirect("/forbidden");
  const canEdit = can(ctx, "lifecycle.update") && canAccessEmployee(ctx, "lifecycle.update", c.employee) && c.status === "IN_PROGRESS";
  const [opts, assets] = await Promise.all([orgOptions(), prisma.asset.findMany({ where: { currentHolderId: c.employeeId }, select: { id: true, code: true, name: true, category: true } })]);
  const today = new Date();
  const isOff = c.type === "OFFBOARDING";
  return (
    <div className="space-y-5">
      <PageHeader
        back={{ href: `/lifecycle?type=${c.type}`, label: "Tiếp nhận / nghỉ việc" }}
        title={`${isOff ? "Nghỉ việc" : "Tiếp nhận"}: ${c.employee.fullName}`}
        description={`${c.employee.code} · ${c.employee.department?.name ?? ""}${c.targetDate ? ` · ${isOff ? "ngày làm việc cuối" : "hạn hội nhập"} ${fmtDate(c.targetDate)}` : ""}${c.mentor ? ` · người hướng dẫn: ${c.mentor.fullName}` : ""}`}
        actions={
          canEdit && (
            <>
              <FormDialog
                title="Thêm đầu việc"
                url={`/api/lifecycle/${c.id}`}
                trigger="Thêm đầu việc"
                triggerVariant="outline"
                icon="plus"
                fields={[
                  { name: "action", label: "", type: "hidden", defaultValue: "add_task" },
                  { name: "title", label: "Nội dung", required: true, full: true },
                  { name: "category", label: "Nhóm", type: "select", options: Object.entries(TASK_CATEGORY).map(([value, label]) => ({ value, label })), defaultValue: "OTHER", required: true },
                  { name: "assigneeId", label: "Người phụ trách", type: "select", options: opts.employees },
                  { name: "dueDate", label: "Hạn", type: "date" },
                ]}
              />
              <CompleteChecklist id={c.id} type={c.type} pending={c.tasks.filter((t) => !t.doneAt).length} assetsHeld={assets.length} isProbation={c.employee.status === "PROBATION"} accountActive={!!c.employee.user?.isActive} />
            </>
          )
        }
      />
      {c.reason && <Notice>{c.reason}</Notice>}
      {isOff && assets.length > 0 && (
        <Notice tone="warning">
          Nhân viên đang giữ {assets.length} tài sản:{" "}
          {assets.map((a) => (
            <Link key={a.id} href={`/assets?q=${a.code}`} className="underline">
              {a.code} {a.name} ({ASSET_CATEGORY[a.category]})
            </Link>
          ))}
          . Thu hồi tại mục Tài sản trước khi hoàn tất.
        </Notice>
      )}
      <Card>
        <CardHeader title={`Đầu việc (${c.tasks.filter((t) => t.doneAt).length}/${c.tasks.length})`} />
        <ul className="divide-y divide-border">
          {c.tasks.map((t) => {
            const overdue = !t.doneAt && t.dueDate && t.dueDate < today;
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <TaskToggle checklistId={c.id} taskId={t.id} done={!!t.doneAt} disabled={!canEdit} />
                <div className="min-w-0 flex-1">
                  <p className={t.doneAt ? "text-muted-foreground line-through" : "font-medium"}>{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    <Badge tone="slate">{TASK_CATEGORY[t.category] ?? t.category}</Badge> {t.assignee ? `· ${t.assignee.fullName}` : "· chưa phân công"}
                    {t.dueDate && <span className={overdue ? "text-rose-600" : ""}> · hạn {fmtDate(t.dueDate)}</span>}
                    {t.doneAt && ` · xong ${fmtDate(t.doneAt)}`}
                  </p>
                </div>
                {canEdit && !t.doneAt && (
                  <FormDialog
                    title={`Phân công: ${t.title}`}
                    url={`/api/lifecycle/${c.id}`}
                    trigger="Phân công"
                    triggerVariant="ghost"
                    triggerSize="sm"
                    fields={[
                      { name: "action", label: "", type: "hidden", defaultValue: "assign_task" },
                      { name: "taskId", label: "", type: "hidden", defaultValue: t.id },
                      { name: "assigneeId", label: "Người phụ trách", type: "select", options: opts.employees, defaultValue: t.assigneeId },
                      { name: "dueDate", label: "Hạn", type: "date", defaultValue: t.dueDate?.toISOString().slice(0, 10) },
                    ]}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
