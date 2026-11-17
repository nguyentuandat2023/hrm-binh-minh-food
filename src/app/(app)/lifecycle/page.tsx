import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { employeeListWhere } from "@/lib/services/employee";
import { orgOptions } from "@/lib/options";
import { fmtDate } from "@/lib/format";
import { spGet, type SP } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/misc";
import { FormDialog } from "@/components/form-dialog";

export const metadata = { title: "Tiếp nhận / nghỉ việc" };

export default async function LifecyclePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("lifecycle.view");
  const sp = await searchParams;
  const type = spGet(sp, "type") === "OFFBOARDING" ? "OFFBOARDING" : "ONBOARDING";
  const status = spGet(sp, "status") ?? "IN_PROGRESS";
  const [items, opts] = await Promise.all([
    prisma.lifecycleChecklist.findMany({
      where: { type, ...(status === "all" ? {} : { status: status as never }), employee: employeeListWhere(ctx, { includeInactive: true }, "lifecycle.view") },
      include: { employee: { select: { id: true, fullName: true, code: true, department: { select: { name: true } } } }, mentor: { select: { fullName: true } }, tasks: { select: { doneAt: true, dueDate: true } } },
      orderBy: { createdAt: "desc" },
    }),
    orgOptions(),
  ]);
  const today = new Date();
  return (
    <div>
      <PageHeader
        title="Tiếp nhận & nghỉ việc"
        description="Checklist hội nhập nhân viên mới và bàn giao khi nghỉ việc"
        actions={
          can(ctx, "lifecycle.create") && (
            <>
              <FormDialog
                title="Tạo checklist tiếp nhận"
                url="/api/lifecycle"
                trigger="Tiếp nhận nhân viên mới"
                icon="plus"
                fields={[
                  { name: "type", label: "", type: "hidden", defaultValue: "ONBOARDING" },
                  { name: "employeeId", label: "Nhân viên", type: "select", required: true, options: opts.employees, emptyOption: "— Chọn —" },
                  { name: "mentorId", label: "Người hướng dẫn", type: "select", options: opts.employees },
                  { name: "targetDate", label: "Hạn hoàn tất hội nhập", type: "date" },
                ]}
              />
              <FormDialog
                title="Tạo checklist nghỉ việc"
                url="/api/lifecycle"
                trigger="Ghi nhận nghỉ việc"
                triggerVariant="outline"
                fields={[
                  { name: "type", label: "", type: "hidden", defaultValue: "OFFBOARDING" },
                  { name: "employeeId", label: "Nhân viên", type: "select", required: true, options: opts.employees, emptyOption: "— Chọn —" },
                  { name: "targetDate", label: "Ngày làm việc cuối cùng", type: "date", required: true },
                  { name: "reason", label: "Lý do / căn cứ (đơn xin nghỉ, quyết định…)", type: "textarea", required: true },
                ]}
              />
            </>
          )
        }
      />
      <Tabs
        items={[
          { key: "ONBOARDING", label: "Tiếp nhận (onboarding)", href: `?type=ONBOARDING&status=${status}` },
          { key: "OFFBOARDING", label: "Nghỉ việc (offboarding)", href: `?type=OFFBOARDING&status=${status}` },
        ]}
        active={type}
      />
      <div className="mb-4 flex gap-2 text-sm">
        {[
          ["IN_PROGRESS", "Đang thực hiện"],
          ["COMPLETED", "Đã hoàn tất"],
          ["all", "Tất cả"],
        ].map(([k, l]) => (
          <Link key={k} href={`?type=${type}&status=${k}`} className={`rounded-full px-3 py-1 ${status === k ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            {l}
          </Link>
        ))}
      </div>
      {items.length === 0 ? (
        <Card>
          <EmptyState title="Không có checklist" />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => {
            const done = c.tasks.filter((t) => t.doneAt).length;
            const overdue = c.tasks.filter((t) => !t.doneAt && t.dueDate && t.dueDate < today).length;
            const pct = c.tasks.length ? Math.round((done / c.tasks.length) * 100) : 0;
            return (
              <Link key={c.id} href={`/lifecycle/${c.id}`}>
                <Card className="h-full p-4 transition-colors hover:border-primary/50">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{c.employee.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.employee.code} · {c.employee.department?.name}
                      </p>
                    </div>
                    <Badge tone={c.status === "COMPLETED" ? "green" : c.status === "CANCELLED" ? "slate" : "blue"}>{c.status === "COMPLETED" ? "Hoàn tất" : c.status === "CANCELLED" ? "Đã huỷ" : "Đang thực hiện"}</Badge>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-[var(--chart-1)]" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {done}/{c.tasks.length} đầu việc{overdue ? <span className="text-rose-600"> · {overdue} quá hạn</span> : ""}
                    {c.targetDate ? ` · ${type === "OFFBOARDING" ? "ngày cuối" : "hạn"} ${fmtDate(c.targetDate)}` : ""}
                    {c.mentor ? ` · hướng dẫn: ${c.mentor.fullName}` : ""}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
