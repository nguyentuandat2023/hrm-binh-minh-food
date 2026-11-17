import Link from "next/link";
import { FileDown, QrCode } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { employeeListWhere } from "@/lib/services/employee";
import { buildTimesheet } from "@/lib/services/attendance";
import { selectedBranch } from "@/lib/page-ctx";
import { orgOptions } from "@/lib/options";
import { dbDate, monthRange, vnDateKey } from "@/lib/dates";
import { fmtDate, fmtDateTime, fmtMinutes } from "@/lib/format";
import { DAY_STATUS_META } from "@/lib/attendance-calc";
import { REQUEST_STATUS } from "@/lib/labels";
import { pageParams } from "@/lib/api";
import { qs, spGet, type SP } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader, Pagination, Tabs } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar } from "@/components/filter-bar";
import { TimesheetGrid } from "./timesheet-grid";

export const metadata = { title: "Chấm công" };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("attendance.view");
  const sp = await searchParams;
  const tab = spGet(sp, "tab") ?? "timesheet";
  const today = vnDateKey();
  const month = /^\d{4}-\d{2}$/.test(spGet(sp, "month") ?? "") ? spGet(sp, "month")! : today.slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const range = monthRange(y, m);
  const f = { q: spGet(sp, "q"), department: spGet(sp, "department"), branch: spGet(sp, "branch") || (await selectedBranch(ctx, "attendance.view")) || undefined };
  const where = employeeListWhere(ctx, { q: f.q, departmentId: f.department, branchId: f.branch }, "attendance.view");
  const opts = await orgOptions();
  const tabs = [
    { key: "timesheet", label: "Bảng công tháng", href: `?tab=timesheet${month ? `&month=${month}` : ""}` },
    { key: "today", label: "Hôm nay", href: "?tab=today" },
    { key: "requests", label: "Đề nghị & tăng ca", href: "?tab=requests" },
  ];
  const filters = (
    <FilterBar
      filters={[
        ...(tab === "timesheet" ? [{ name: "month", label: "Tháng", type: "month" as const, defaultValue: month }] : []),
        { name: "q", label: "Tìm nhân viên", type: "search" },
        { name: "department", label: "Phòng ban", type: "select", options: opts.departments },
        ...(ctx.perms["attendance.view"] === "COMPANY" ? [{ name: "branch", label: "Chi nhánh", type: "select" as const, options: opts.branches }] : []),
      ]}
    />
  );

  let content: React.ReactNode;
  if (tab === "today") {
    const emps = await prisma.employee.findMany({
      where: { AND: [where, { status: { not: "RESIGNED" } }] },
      select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
      orderBy: { code: "asc" },
      take: 500,
    });
    const rows = await buildTimesheet(emps, today, today, today);
    const order: Record<string, number> = { ABSENT: 0, MISSING_IN: 1, WORKING: 2, PARTIAL: 3, FULL: 4 };
    rows.sort((a, b) => (order[a.cells[0].status] ?? 9) - (order[b.cells[0].status] ?? 9));
    const scheduled = rows.filter((r) => r.cells[0].status !== "OFF");
    content = (
      <Card>
        <div className="border-b border-border p-3">{filters}</div>
        {scheduled.length === 0 ? (
          <EmptyState title="Hôm nay không có ai có lịch làm việc" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Nhân viên</TH>
                <TH className="hidden md:table-cell">Ca</TH>
                <TH>Vào</TH>
                <TH>Ra</TH>
                <TH>Đi muộn</TH>
                <TH>Trạng thái</TH>
              </tr>
            </THead>
            <TBody>
              {scheduled.map((r) => {
                const c = r.cells[0];
                return (
                  <TR key={r.employee.id}>
                    <TD>
                      <Link href={`/employees/${r.employee.id}`} className="font-medium hover:underline">
                        {r.employee.fullName}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{r.employee.department}</span>
                    </TD>
                    <TD className="hidden text-xs md:table-cell">{c.shift}</TD>
                    <TD className="tabular">{c.checkIn ? fmtDateTime(c.checkIn).slice(-5) : "—"}</TD>
                    <TD className="tabular">{c.checkOut ? fmtDateTime(c.checkOut).slice(-5) : "—"}</TD>
                    <TD className="tabular">{c.late ? fmtMinutes(c.late) : ""}</TD>
                    <TD>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${DAY_STATUS_META[c.status].className}`}>{DAY_STATUS_META[c.status].label}</span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    );
  } else if (tab === "requests") {
    const empIds = (await prisma.employee.findMany({ where, select: { id: true } })).map((e) => e.id);
    const approvals = await prisma.approvalRequest.findMany({
      where: { type: { in: ["ATTENDANCE_ADJUSTMENT", "OVERTIME"] }, employeeId: { in: empIds } },
      include: { employee: { select: { fullName: true, code: true } }, steps: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    content = (
      <Card>
        <div className="border-b border-border p-3">{filters}</div>
        {approvals.length === 0 ? (
          <EmptyState title="Chưa có đề nghị điều chỉnh công hay đăng ký tăng ca" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Nhân viên</TH>
                <TH>Loại</TH>
                <TH>Nội dung</TH>
                <TH className="hidden md:table-cell">Gửi lúc</TH>
                <TH>Trạng thái</TH>
              </tr>
            </THead>
            <TBody>
              {approvals.map((a) => (
                <TR key={a.id}>
                  <TD className="font-medium">{a.employee.fullName}</TD>
                  <TD>{a.type === "OVERTIME" ? <Badge tone="violet">Tăng ca</Badge> : <Badge tone="blue">Điều chỉnh công</Badge>}</TD>
                  <TD className="max-w-md">
                    {a.title}
                    {a.steps[0]?.comment && <span className="block text-xs text-muted-foreground">Ý kiến: {a.steps[0].comment}</span>}
                  </TD>
                  <TD className="hidden text-xs md:table-cell">{fmtDateTime(a.createdAt)}</TD>
                  <TD>
                    <Badge tone={REQUEST_STATUS[a.status].tone}>{REQUEST_STATUS[a.status].label}</Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    );
  } else {
    const { page, size, skip, take } = pageParams({ page: spGet(sp, "page") }, 25);
    const activeInMonth = { AND: [where, { startDate: { lte: dbDate(range.to) } }, { OR: [{ endDate: null }, { endDate: { gte: dbDate(range.from) } }] }] };
    const [total, emps] = await Promise.all([
      prisma.employee.count({ where: activeInMonth }),
      prisma.employee.findMany({ where: activeInMonth, select: { id: true, code: true, fullName: true, department: { select: { name: true } } }, orderBy: { code: "asc" }, skip, take }),
    ]);
    const rows = await buildTimesheet(emps, range.from, range.to, today);
    content = (
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border p-3">
          {filters}
          <p className="text-xs text-muted-foreground">Bấm vào từng ô để xem chi tiết{can(ctx, "attendance.update") ? " hoặc sửa công" : ""}.</p>
        </div>
        {rows.length === 0 ? <EmptyState title="Không có nhân viên" /> : <TimesheetGrid rows={rows as never} canEdit={can(ctx, "attendance.update")} today={today} selfId={ctx.employee?.id ?? null} />}
        <Pagination page={page} size={size} total={total} baseParams={{ tab: "timesheet", month, q: f.q, department: f.department, branch: spGet(sp, "branch") }} />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="Chấm công"
        description={tab === "timesheet" ? `Tháng ${month.slice(5)}/${month.slice(0, 4)} · ${fmtDate(range.from)} – ${fmtDate(range.to)}` : undefined}
        actions={
          <>
            {can(ctx, "attendance.update") && (
              <Link href="/attendance/qr" className={buttonClass("outline")}>
                <QrCode /> Màn hình QR
              </Link>
            )}
            {can(ctx, "attendance.export") && (
              <a href={`/api/attendance/export${qs({ month, q: f.q, department: f.department, branch: spGet(sp, "branch") })}`} className={buttonClass("outline")}>
                <FileDown /> Xuất bảng công
              </a>
            )}
          </>
        }
      />
      <Tabs items={tabs} active={tab} />
      {content}
    </div>
  );
}
