import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { employeeListWhere } from "@/lib/services/employee";
import { orgOptions } from "@/lib/options";
import { pageParams } from "@/lib/api";
import { selectedBranch } from "@/lib/page-ctx";
import { dbDate, eachDay, keyOf, monthRange, vnDateKey } from "@/lib/dates";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { available } from "@/lib/leave-calc";
import { HALF_DAY, REQUEST_STATUS, toOptions } from "@/lib/labels";
import { spGet, type SP } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice, PageHeader, Pagination, Tabs } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar } from "@/components/filter-bar";
import { ActionButton, FormDialog } from "@/components/form-dialog";
import { LeaveRequestDialog } from "@/components/leave-request-dialog";

export const metadata = { title: "Nghỉ phép" };

export default async function LeavePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("leave.view");
  const sp = await searchParams;
  const tab = spGet(sp, "tab") ?? "requests";
  const today = vnDateKey();
  const isHr = can(ctx, "leave.update", "COMPANY");
  const opts = await orgOptions();
  const branch = spGet(sp, "branch") || (await selectedBranch(ctx, "leave.view")) || undefined;
  const scopeWhere = employeeListWhere(ctx, { q: spGet(sp, "q"), departmentId: spGet(sp, "department"), branchId: branch, includeInactive: true }, "leave.view");
  const types = await prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const tabs = [
    { key: "requests", label: "Đơn nghỉ", href: "?tab=requests" },
    { key: "calendar", label: "Lịch nghỉ", href: "?tab=calendar" },
    { key: "balances", label: "Số ngày phép", href: "?tab=balances" },
    ...(isHr ? [{ key: "types", label: "Loại nghỉ & chính sách", href: "?tab=types" }] : []),
  ];
  const baseFilters = [
    { name: "q", label: "Tìm nhân viên", type: "search" as const },
    { name: "department", label: "Phòng ban", type: "select" as const, options: opts.departments },
  ];

  let body: React.ReactNode;
  if (tab === "calendar") {
    const month = /^\d{4}-\d{2}$/.test(spGet(sp, "month") ?? "") ? spGet(sp, "month")! : today.slice(0, 7);
    const r = monthRange(Number(month.slice(0, 4)), Number(month.slice(5)));
    const leaves = await prisma.leaveRequest.findMany({
      where: { status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: dbDate(r.to) }, endDate: { gte: dbDate(r.from) }, employee: scopeWhere },
      include: { employee: { select: { id: true, fullName: true } }, leaveType: { select: { name: true, color: true } } },
      orderBy: { startDate: "asc" },
    });
    const holidays = await prisma.holiday.findMany({ where: { date: { gte: dbDate(r.from), lte: dbDate(r.to) } } });
    const days = eachDay(r.from, r.to);
    const firstDow = (new Date(r.from + "T00:00:00Z").getUTCDay() + 6) % 7;
    body = (
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar filters={[{ name: "month", label: "Tháng", type: "month", defaultValue: month }, ...baseFilters]} />
        </div>
        <div className="grid grid-cols-7 gap-px bg-border text-xs">
          {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((d) => (
            <div key={d} className="bg-muted px-2 py-1.5 text-center font-medium">
              {d}
            </div>
          ))}
          {Array.from({ length: firstDow }).map((_, i) => (
            <div key={`e${i}`} className="min-h-24 bg-card/50" />
          ))}
          {days.map((d) => {
            const items = leaves.filter((l) => keyOf(l.startDate)! <= d && keyOf(l.endDate)! >= d);
            const hol = holidays.find((h) => keyOf(h.date) === d);
            return (
              <div key={d} className={`min-h-24 bg-card p-1.5 ${d === today ? "ring-2 ring-inset ring-primary" : ""}`}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-semibold">{Number(d.slice(8))}</span>
                  {hol && <span className="truncate text-[10px] text-violet-600">{hol.name}</span>}
                </div>
                <div className="space-y-0.5">
                  {items.slice(0, 4).map((l) => (
                    <div key={l.id} className="truncate rounded px-1 py-0.5 text-[11px] text-white" style={{ background: l.leaveType.color, opacity: l.status === "PENDING" ? 0.55 : 1 }} title={`${l.employee.fullName} – ${l.leaveType.name}${l.status === "PENDING" ? " (chờ duyệt)" : ""}`}>
                      {l.employee.fullName.split(" ").slice(-2).join(" ")}
                      {l.halfDay !== "NONE" ? " ½" : ""}
                    </div>
                  ))}
                  {items.length > 4 && <div className="text-[11px] text-muted-foreground">+{items.length - 4} người</div>}
                </div>
              </div>
            );
          })}
        </div>
        <p className="px-4 py-2 text-xs text-muted-foreground">Ô mờ = đơn đang chờ duyệt. Rê chuột để xem chi tiết.</p>
      </Card>
    );
  } else if (tab === "balances") {
    const year = Number(spGet(sp, "year")) || Number(today.slice(0, 4));
    const deductTypes = types.filter((t) => t.deductsBalance);
    const emps = await prisma.employee.findMany({
      where: { AND: [scopeWhere, { deactivatedAt: null, status: { not: "RESIGNED" } }] },
      select: { id: true, code: true, fullName: true, department: { select: { name: true } }, leaveBalances: { where: { year } }, leaveRequests: { where: { status: "PENDING", startDate: { gte: dbDate(`${year}-01-01`), lte: dbDate(`${year}-12-31`) } }, select: { leaveTypeId: true, days: true } } },
      orderBy: { code: "asc" },
    });
    const annual = deductTypes.find((t) => t.code === "ANNUAL") ?? deductTypes[0];
    body = (
      <Card>
        <CardHeader
          title={`Số ngày phép năm ${year}`}
          description="Được hưởng + chuyển năm trước + điều chỉnh − đã dùng − đang chờ duyệt = còn lại"
          actions={isHr && <ActionButton url="/api/leave/balances" body={{ action: "init", year }} label={`Khởi tạo phép năm ${year}`} confirmTitle={`Khởi tạo số ngày phép năm ${year} cho nhân viên chưa có?`} confirmMessage="Số ngày được tính theo chính sách phép (thâm niên, tỷ lệ năm đầu). Không ghi đè số dư đã có." successMessage="Đã khởi tạo số dư phép" />}
        />
        <div className="border-b border-border p-3">
          <FilterBar filters={[...baseFilters, { name: "year", label: "Năm", type: "select", options: [year - 1, year, year + 1].map((y) => ({ value: String(y), label: String(y) })) }]} />
        </div>
        {!annual ? (
          <EmptyState title="Chưa có loại nghỉ trừ phép" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Nhân viên</TH>
                <TH className="text-right">Được hưởng</TH>
                <TH className="text-right">Chuyển sang</TH>
                <TH className="text-right">Điều chỉnh</TH>
                <TH className="text-right">Đã dùng</TH>
                <TH className="text-right">Chờ duyệt</TH>
                <TH className="text-right">Còn lại</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {emps.map((e) => {
                const b = e.leaveBalances.find((x) => x.leaveTypeId === annual.id);
                const pending = e.leaveRequests.filter((x) => x.leaveTypeId === annual.id).reduce((s, x) => s + x.days, 0);
                return (
                  <TR key={e.id}>
                    <TD>
                      <span className="font-medium">{e.fullName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {e.code} · {e.department?.name}
                      </span>
                    </TD>
                    {b ? (
                      <>
                        <TD className="tabular text-right">{b.entitled}</TD>
                        <TD className="tabular text-right">{b.carriedOver}</TD>
                        <TD className="tabular text-right">{b.adjustment}</TD>
                        <TD className="tabular text-right">{b.used}</TD>
                        <TD className="tabular text-right">{pending}</TD>
                        <TD className="tabular text-right font-semibold">{available(b, pending)}</TD>
                      </>
                    ) : (
                      <TD colSpan={6} className="text-right text-xs text-muted-foreground">
                        Chưa khởi tạo (tự tạo khi gửi đơn)
                      </TD>
                    )}
                    <TD className="text-right">
                      {can(ctx, "leave.update") && (
                        <FormDialog
                          title={`Điều chỉnh phép ${year} – ${e.fullName}`}
                          url="/api/leave/balances"
                          trigger="Điều chỉnh"
                          triggerVariant="ghost"
                          triggerSize="sm"
                          successMessage="Đã điều chỉnh số ngày phép"
                          fields={[
                            { name: "action", label: "", type: "hidden", defaultValue: "adjust" },
                            { name: "employeeId", label: "", type: "hidden", defaultValue: e.id },
                            { name: "year", label: "", type: "hidden", defaultValue: year },
                            { name: "leaveTypeId", label: "Loại phép", type: "select", options: deductTypes.map((t) => ({ value: t.id, label: t.name })), required: true, defaultValue: annual.id },
                            { name: "entitled", label: "Được hưởng", type: "number", step: 0.5, min: 0, required: true, defaultValue: b?.entitled ?? 0 },
                            { name: "carriedOver", label: "Chuyển từ năm trước", type: "number", step: 0.5, min: 0, required: true, defaultValue: b?.carriedOver ?? 0 },
                            { name: "adjustment", label: "Điều chỉnh (+/−)", type: "number", step: 0.5, required: true, defaultValue: b?.adjustment ?? 0 },
                            { name: "reason", label: "Lý do", required: true, full: true },
                          ]}
                        />
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    );
  } else if (tab === "types" && isHr) {
    const all = await prisma.leaveType.findMany({ orderBy: { name: "asc" } });
    const policy = await prisma.companySetting.findUnique({ where: { key: "leave" } });
    const fields = (t?: (typeof all)[number]) => [
      ...(t ? [{ name: "id", label: "", type: "hidden" as const, defaultValue: t.id }] : []),
      { name: "code", label: "Mã", required: true, defaultValue: t?.code },
      { name: "name", label: "Tên loại nghỉ", required: true, defaultValue: t?.name },
      { name: "defaultQuota", label: "Số ngày mặc định/năm", type: "number" as const, min: 0, step: 0.5, defaultValue: t?.defaultQuota ?? 0, hint: "Phép năm (ANNUAL) tính theo chính sách thâm niên" },
      { name: "color", label: "Màu (#RRGGBB)", defaultValue: t?.color ?? "#2563eb" },
      { name: "isPaid", label: "Công ty trả lương những ngày nghỉ này", type: "checkbox" as const, defaultValue: t?.isPaid ?? true },
      { name: "deductsBalance", label: "Trừ vào số ngày phép", type: "checkbox" as const, defaultValue: t?.deductsBalance ?? true },
      { name: "requiresAttachment", label: "Bắt buộc đính kèm giấy tờ", type: "checkbox" as const, defaultValue: t?.requiresAttachment ?? false },
      { name: "isActive", label: "Đang sử dụng", type: "checkbox" as const, defaultValue: t?.isActive ?? true },
    ];
    body = (
      <div className="space-y-4">
        <Notice tone="warning">
          Số ngày phép và loại nghỉ là cấu hình của doanh nghiệp. Giá trị mặc định tham chiếu Bộ luật Lao động 2019 nhưng <b>chưa được xác minh pháp lý</b> – HR/pháp chế cần rà soát theo quy định hiện hành và nội quy công ty. Chính sách thâm niên, duyệt 2 cấp: Cài đặt → Chính sách nghỉ phép.
          {policy ? "" : " (Đang dùng chính sách mặc định.)"}
        </Notice>
        <Card>
          <CardHeader title="Loại nghỉ" actions={<FormDialog title="Thêm loại nghỉ" url="/api/leave/types" fields={fields()} trigger="Thêm loại nghỉ" icon="plus" />} />
          <Table>
            <THead>
              <tr>
                <TH>Loại nghỉ</TH>
                <TH>Hưởng lương</TH>
                <TH>Trừ phép</TH>
                <TH>Mặc định/năm</TH>
                <TH>Đính kèm</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {all.map((t) => (
                <TR key={t.id} className={t.isActive ? undefined : "opacity-50"}>
                  <TD>
                    <span className="inline-flex items-center gap-2 font-medium">
                      <span className="size-3 rounded-sm" style={{ background: t.color }} />
                      {t.name}
                    </span>
                    <span className="block font-mono text-xs text-muted-foreground">{t.code}</span>
                  </TD>
                  <TD>{t.isPaid ? "Có" : "Không"}</TD>
                  <TD>{t.deductsBalance ? "Có" : "Không"}</TD>
                  <TD className="tabular">{t.defaultQuota}</TD>
                  <TD>{t.requiresAttachment ? "Bắt buộc" : "—"}</TD>
                  <TD className="text-right">
                    <FormDialog title={`Sửa ${t.name}`} url="/api/leave/types" fields={fields(t)} trigger="Sửa" triggerVariant="ghost" triggerSize="sm" />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    );
  } else {
    const status = spGet(sp, "status");
    const typeId = spGet(sp, "type");
    const where: Prisma.LeaveRequestWhereInput = {
      employee: scopeWhere,
      ...(status ? { status: status as never } : {}),
      ...(typeId ? { leaveTypeId: typeId } : {}),
    };
    const { page, size, skip, take } = pageParams({ page: spGet(sp, "page") });
    const [total, items] = await Promise.all([
      prisma.leaveRequest.count({ where }),
      prisma.leaveRequest.findMany({
        where,
        include: { employee: { select: { id: true, fullName: true, code: true } }, leaveType: { select: { name: true, color: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);
    const approvals = await prisma.approvalRequest.findMany({ where: { type: "LEAVE", entityId: { in: items.map((i) => i.id) } }, include: { steps: { orderBy: { createdAt: "asc" } } } });
    body = (
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar filters={[...baseFilters, { name: "status", label: "Trạng thái", type: "select", options: toOptions(REQUEST_STATUS) }, { name: "type", label: "Loại nghỉ", type: "select", options: types.map((t) => ({ value: t.id, label: t.name })) }]} />
        </div>
        {items.length === 0 ? (
          <EmptyState title="Chưa có đơn nghỉ" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Nhân viên</TH>
                <TH>Loại nghỉ</TH>
                <TH>Thời gian</TH>
                <TH className="text-right">Số ngày</TH>
                <TH className="hidden lg:table-cell">Lý do</TH>
                <TH>Trạng thái</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {items.map((l) => {
                const a = approvals.find((x) => x.entityId === l.id);
                const canCancel = (l.employeeId === ctx.employee?.id && (l.status === "PENDING" || (l.status === "APPROVED" && keyOf(l.startDate)! > today))) || (isHr && (l.status === "PENDING" || l.status === "APPROVED"));
                return (
                  <TR key={l.id}>
                    <TD>
                      <Link href={`/employees/${l.employee.id}`} className="font-medium hover:underline">
                        {l.employee.fullName}
                      </Link>
                      <span className="block text-xs text-muted-foreground">Gửi {fmtDateTime(l.createdAt)}</span>
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2.5 rounded-sm" style={{ background: l.leaveType.color }} />
                        {l.leaveType.name}
                      </span>
                    </TD>
                    <TD className="tabular text-xs">
                      {fmtDate(l.startDate)}
                      {keyOf(l.endDate) !== keyOf(l.startDate) ? ` → ${fmtDate(l.endDate)}` : l.halfDay !== "NONE" ? ` (${HALF_DAY[l.halfDay]})` : ""}
                    </TD>
                    <TD className="tabular text-right">{l.days}</TD>
                    <TD className="hidden max-w-xs truncate lg:table-cell" title={l.reason}>
                      {l.reason}
                      {l.attachmentId && (
                        <a href={`/api/files/${l.attachmentId}`} className="ml-2 text-xs text-primary hover:underline">
                          Đính kèm
                        </a>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={REQUEST_STATUS[l.status].tone}>{REQUEST_STATUS[l.status].label}</Badge>
                      {a && a.status === "PENDING" && a.requiredLevels > 1 && <span className="block text-[11px] text-muted-foreground">Cấp {a.currentLevel}/{a.requiredLevels}</span>}
                      {a?.steps.find((s) => s.decision === "REJECTED")?.comment && <span className="block max-w-40 truncate text-[11px] text-muted-foreground">{a.steps.find((s) => s.decision === "REJECTED")?.comment}</span>}
                    </TD>
                    <TD className="text-right">
                      {canCancel && (
                        <ActionButton url={`/api/leave/requests/${l.id}/cancel`} label="Huỷ" variant="ghost" danger confirmTitle="Huỷ đơn nghỉ này?" confirmMessage={l.status === "APPROVED" ? "Đơn đã duyệt – số ngày phép sẽ được hoàn lại." : undefined} successMessage="Đã huỷ đơn" />
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        <Pagination page={page} size={size} total={total} baseParams={{ tab, status, type: typeId, q: spGet(sp, "q"), department: spGet(sp, "department") }} />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="Nghỉ phép"
        description="Đơn đã duyệt tự động trừ số ngày phép và đồng bộ vào bảng công"
        actions={
          ctx.employee || isHr ? (
            <LeaveRequestDialog
              types={types.map((t) => ({ id: t.id, name: t.name, requiresAttachment: t.requiresAttachment, deductsBalance: t.deductsBalance, isPaid: t.isPaid }))}
              employees={isHr ? opts.employees : undefined}
            />
          ) : null
        }
      />
      <Tabs items={tabs} active={tab} />
      {body}
    </div>
  );
}
