import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { buildTimesheet, loadScheduleContext, shiftFor } from "@/lib/services/attendance";
import { addDays, dbDate, keyOf, monthRange, vnDateKey } from "@/lib/dates";
import { fmtDate, fmtDateTime, fmtMinutes, fmtTime, fmtVND } from "@/lib/format";
import { available } from "@/lib/leave-calc";
import { DAY_STATUS_META } from "@/lib/attendance-calc";
import { kpiCompletion, kpiRating, weightedScore } from "@/lib/kpi-calc";
import { ASSET_CATEGORY, EMPLOYEE_STATUS, HALF_DAY, KPI_STATUS, REQUEST_STATUS } from "@/lib/labels";
import { spGet, type SP, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, StatCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, InfoRow, Notice, PageHeader, Tabs } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PunchCard } from "@/components/punch-card";
import { LeaveRequestDialog } from "@/components/leave-request-dialog";
import { ActionButton, FormDialog } from "@/components/form-dialog";
import { EditPrivateButton } from "../employees/[id]/detail-client";
import { Bell, CalendarDays, Clock, Plane } from "lucide-react";

export const metadata = { title: "Cổng nhân viên" };

export default async function MePage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePageAuth();
  if (!ctx.employee) {
    return (
      <div>
        <PageHeader title="Cổng nhân viên" />
        <Notice>Tài khoản của bạn không liên kết với hồ sơ nhân viên nào (tài khoản quản trị hệ thống).</Notice>
      </div>
    );
  }
  const sp = await searchParams;
  const tab = spGet(sp, "tab") ?? "overview";
  const me = ctx.employee;
  const today = vnDateKey();
  const year = Number(today.slice(0, 4));
  const settings = await getSetting("attendance");
  const emp = await prisma.employee.findUniqueOrThrow({
    where: { id: me.id },
    include: { department: { select: { name: true } }, position: { select: { name: true } }, branch: { select: { name: true } }, manager: { select: { fullName: true } } },
  });
  const tabs = [
    { key: "overview", label: "Tổng quan", href: "?tab=overview" },
    { key: "schedule", label: "Lịch làm việc", href: "?tab=schedule" },
    { key: "timesheet", label: "Bảng công", href: "?tab=timesheet" },
    { key: "leave", label: "Nghỉ phép", href: "?tab=leave" },
    { key: "payslips", label: "Phiếu lương", href: "?tab=payslips" },
    { key: "kpi", label: "KPI", href: "?tab=kpi" },
    { key: "requests", label: "Điều chỉnh công & tăng ca", href: "?tab=requests" },
    { key: "assets", label: "Tài sản", href: "?tab=assets" },
  ];
  const leaveTypes = await prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  const leaveDialog = <LeaveRequestDialog types={leaveTypes.map((t) => ({ id: t.id, name: t.name, requiresAttachment: t.requiresAttachment, deductsBalance: t.deductsBalance, isPaid: t.isPaid }))} />;

  let body: React.ReactNode;
  if (tab === "overview") {
    const [todayRows, balances, pending, unreadCount] = await Promise.all([
      buildTimesheet([{ id: me.id, code: me.code, fullName: me.fullName, department: null }], today, today, today),
      prisma.leaveBalance.findMany({ where: { employeeId: me.id, year }, include: { leaveType: true } }),
      prisma.approvalRequest.count({ where: { employeeId: me.id, status: "PENDING" } }),
      prisma.notification.count({ where: { userId: ctx.userId, readAt: null } }),
    ]);
    const c = todayRows[0].cells[0];
    const pendingLeave = await prisma.leaveRequest.findMany({ where: { employeeId: me.id, status: "PENDING" }, select: { leaveTypeId: true, days: true } });
    const annual = balances.find((b) => b.leaveType.code === "ANNUAL");
    const annualAvail = annual ? available(annual, pendingLeave.filter((p) => p.leaveTypeId === annual.leaveTypeId).reduce((s, p) => s + p.days, 0)) : null;
    const monthRows = await buildTimesheet([{ id: me.id, code: me.code, fullName: me.fullName, department: null }], today.slice(0, 8) + "01", today, today);
    body = (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="space-y-5">
          <PunchCard gpsEnabled={settings.gpsEnabled} webAllowed={settings.allowWebCheckin} consentText={settings.gpsEnabled ? settings.gpsConsentText : undefined} today={{ checkIn: c.checkIn ? fmtTime(c.checkIn) : null, checkOut: c.checkOut ? fmtTime(c.checkOut) : null, shift: c.shift }} />
          <p className="text-center text-xs text-muted-foreground">Có thể quét mã QR tại văn phòng để chấm công thay cho nút bấm.</p>
        </div>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="Công tháng này" value={monthRows[0].totals.workdays} icon={<Clock />} hint={`Đi muộn ${monthRows[0].totals.lateCount} lần`} href="?tab=timesheet" />
            <StatCard label="Phép năm còn lại" value={annualAvail ?? "—"} icon={<Plane />} tone="blue" href="?tab=leave" />
            <StatCard label="Yêu cầu chờ duyệt" value={pending} icon={<CalendarDays />} tone="amber" href="?tab=requests" />
            <StatCard label="Thông báo chưa đọc" value={unreadCount} icon={<Bell />} tone="violet" href="/notifications" />
          </div>
          <Card>
            <CardHeader title="Hồ sơ của tôi" actions={<EditPrivateButton id={me.id} limited label="Cập nhật liên hệ" data={{ phone: emp.phone, address: emp.address, emergencyName: emp.emergencyName, emergencyPhone: emp.emergencyPhone, emergencyRelation: emp.emergencyRelation }} />} />
            <CardContent className="flex flex-wrap gap-5">
              <Avatar name={emp.fullName} fileId={emp.avatarFileId} size={64} />
              <dl className="min-w-64 flex-1">
                <InfoRow label="Họ tên">{emp.fullName}</InfoRow>
                <InfoRow label="Mã nhân viên">{emp.code}</InfoRow>
                <InfoRow label="Phòng ban / chức vụ">{[emp.department?.name, emp.position?.name].filter(Boolean).join(" · ")}</InfoRow>
                <InfoRow label="Quản lý trực tiếp">{emp.manager?.fullName}</InfoRow>
                <InfoRow label="Chi nhánh">{emp.branch?.name}</InfoRow>
                <InfoRow label="Ngày vào làm">{fmtDate(emp.startDate)}</InfoRow>
                <InfoRow label="Trạng thái">{EMPLOYEE_STATUS[emp.status].label}</InfoRow>
                <InfoRow label="Điện thoại">{emp.phone}</InfoRow>
                <InfoRow label="Địa chỉ">{emp.address}</InfoRow>
                <InfoRow label="Liên hệ khẩn cấp">{[emp.emergencyName, emp.emergencyRelation, emp.emergencyPhone].filter(Boolean).join(" · ")}</InfoRow>
              </dl>
            </CardContent>
            <p className="px-5 pb-4 text-xs text-muted-foreground">
              Thông tin khác (phòng ban, chức vụ, CCCD, ngày sinh…) do bộ phận Nhân sự cập nhật. <Link className="text-primary hover:underline" href={`/employees/${me.id}`}>Xem hồ sơ đầy đủ</Link>
            </p>
          </Card>
        </div>
      </div>
    );
  } else if (tab === "schedule") {
    const to = addDays(today, 13);
    const sctx = await loadScheduleContext([me.id], today, to);
    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
    const leaves = await prisma.leaveRequest.findMany({ where: { employeeId: me.id, status: "APPROVED", startDate: { lte: dbDate(to) }, endDate: { gte: dbDate(today) } }, include: { leaveType: true } });
    body = (
      <Card>
        <CardHeader title="Lịch làm việc 14 ngày tới" />
        <ul className="divide-y divide-border">
          {days.map((d) => {
            const s = shiftFor(sctx, me.id, d);
            const hol = sctx.holidays.get(d);
            const lv = leaves.find((l) => keyOf(l.startDate)! <= d && keyOf(l.endDate)! >= d);
            return (
              <li key={d} className={cn("flex items-center justify-between gap-3 px-5 py-2.5 text-sm", d === today && "bg-primary-soft/40")}>
                <span className="w-36 font-medium">{["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"][new Date(d + "T00:00:00Z").getUTCDay()]} {fmtDate(d).slice(0, 5)}</span>
                <span className="flex-1">
                  {hol ? <Badge tone="violet">Nghỉ lễ: {hol.name}</Badge> : lv ? <Badge tone="blue">{lv.leaveType.name}{lv.halfDay !== "NONE" ? ` (${HALF_DAY[lv.halfDay]})` : ""}</Badge> : s ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="size-3 rounded-sm" style={{ background: s.color }} />
                      {s.name} · {s.startTime}–{s.endTime}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Nghỉ</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    );
  } else if (tab === "timesheet") {
    const month = /^\d{4}-\d{2}$/.test(spGet(sp, "month") ?? "") ? spGet(sp, "month")! : today.slice(0, 7);
    const r = monthRange(Number(month.slice(0, 4)), Number(month.slice(5)));
    const [row] = await buildTimesheet([{ id: me.id, code: me.code, fullName: me.fullName, department: null }], r.from, r.to, today);
    const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1)).toISOString().slice(0, 7);
    const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 7);
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label="Công thực tế" value={row.totals.workdays} />
          <StatCard label="Phép có lương" value={row.totals.paidLeave} tone="blue" />
          <StatCard label="Đi muộn" value={`${row.totals.lateCount} lần`} tone="amber" hint={fmtMinutes(row.totals.lateMinutes)} />
          <StatCard label="Thiếu giờ vào/ra" value={row.totals.missing} tone="rose" />
          <StatCard label="Tăng ca" value={`${(row.totals.otMinutes / 60).toFixed(1)}h`} tone="violet" />
        </div>
        <Card>
          <div className="flex items-center justify-between border-b border-border px-5 py-3 text-sm">
            <Link href={`?tab=timesheet&month=${prev}`} className="text-muted-foreground hover:text-foreground">← Tháng trước</Link>
            <span className="font-semibold">Tháng {month.slice(5)}/{month.slice(0, 4)}</span>
            <Link href={`?tab=timesheet&month=${next}`} className="text-muted-foreground hover:text-foreground">Tháng sau →</Link>
          </div>
          <Table>
            <THead>
              <tr>
                <TH>Ngày</TH>
                <TH>Ca</TH>
                <TH>Vào</TH>
                <TH>Ra</TH>
                <TH>Công</TH>
                <TH>Trạng thái</TH>
              </tr>
            </THead>
            <TBody>
              {row.cells.filter((c) => c.status !== "FUTURE" && c.status !== "OFF").map((c) => (
                <TR key={c.date}>
                  <TD className="tabular">{fmtDate(c.date)}</TD>
                  <TD className="text-xs">{c.shift ?? "—"}</TD>
                  <TD className="tabular">{c.checkIn ? fmtTime(c.checkIn) : "—"}</TD>
                  <TD className="tabular">{c.checkOut ? fmtTime(c.checkOut) : "—"}</TD>
                  <TD className="tabular">{c.value}</TD>
                  <TD>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${DAY_STATUS_META[c.status].className}`}>{DAY_STATUS_META[c.status].label}</span>
                    {c.late > 0 && <span className="ml-1 text-xs text-amber-600">muộn {fmtMinutes(c.late)}</span>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <p className="px-5 py-3 text-xs text-muted-foreground">Thiếu giờ vào/ra hoặc chấm sai? Gửi đề nghị ở tab “Điều chỉnh công & tăng ca”.</p>
        </Card>
      </div>
    );
  } else if (tab === "leave") {
    const [balances, requests] = await Promise.all([
      prisma.leaveBalance.findMany({ where: { employeeId: me.id, year }, include: { leaveType: true } }),
      prisma.leaveRequest.findMany({ where: { employeeId: me.id }, include: { leaveType: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    const pendingBy = (t: string) => requests.filter((r) => r.status === "PENDING" && r.leaveTypeId === t && r.startDate.getUTCFullYear() === year).reduce((s, r) => s + r.days, 0);
    body = (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {balances.length === 0 && <Notice className="col-span-full">Số ngày phép năm {year} sẽ được khởi tạo khi bạn gửi đơn đầu tiên hoặc khi HR khởi tạo.</Notice>}
          {balances.map((b) => (
            <StatCard key={b.id} label={b.leaveType.name} value={available(b, pendingBy(b.leaveTypeId))} hint={`Được hưởng ${b.entitled + b.carriedOver + b.adjustment} · đã dùng ${b.used}`} tone="blue" />
          ))}
        </div>
        <Card>
          <CardHeader title="Đơn nghỉ của tôi" actions={leaveDialog} />
          {requests.length === 0 ? (
            <EmptyState title="Chưa có đơn nghỉ" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Loại</TH>
                  <TH>Thời gian</TH>
                  <TH className="text-right">Ngày</TH>
                  <TH>Trạng thái</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {requests.map((l) => (
                  <TR key={l.id}>
                    <TD>{l.leaveType.name}</TD>
                    <TD className="tabular text-xs">
                      {fmtDate(l.startDate)}
                      {keyOf(l.endDate) !== keyOf(l.startDate) ? ` → ${fmtDate(l.endDate)}` : l.halfDay !== "NONE" ? ` (${HALF_DAY[l.halfDay]})` : ""}
                    </TD>
                    <TD className="tabular text-right">{l.days}</TD>
                    <TD>
                      <Badge tone={REQUEST_STATUS[l.status].tone}>{REQUEST_STATUS[l.status].label}</Badge>
                    </TD>
                    <TD className="text-right">
                      {(l.status === "PENDING" || (l.status === "APPROVED" && keyOf(l.startDate)! > today)) && (
                        <ActionButton url={`/api/leave/requests/${l.id}/cancel`} label="Huỷ" variant="ghost" danger confirmTitle="Huỷ đơn nghỉ này?" successMessage="Đã huỷ đơn" />
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    );
  } else if (tab === "payslips") {
    const records = await prisma.payrollRecord.findMany({
      where: { employeeId: me.id, period: { status: "LOCKED" } },
      include: { period: true },
      orderBy: [{ period: { year: "desc" } }, { period: { month: "desc" } }],
    });
    body = (
      <Card>
        <CardHeader title="Phiếu lương của tôi" description="Chỉ hiển thị kỳ lương đã được duyệt và khoá" />
        {records.length === 0 ? (
          <EmptyState title="Chưa có phiếu lương" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Kỳ lương</TH>
                <TH className="text-right">Tổng thu nhập</TH>
                <TH className="text-right">Khấu trừ</TH>
                <TH className="text-right">Thực lĩnh</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {records.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.period.name}</TD>
                  <TD className="tabular text-right">{fmtVND(r.grossIncome)}</TD>
                  <TD className="tabular text-right">{fmtVND(r.totalDeductions)}</TD>
                  <TD className="tabular text-right font-semibold">{fmtVND(r.netPay)}</TD>
                  <TD className="text-right">
                    <Link className="text-sm text-primary hover:underline" href={`/payroll/payslip/${r.id}`}>
                      Xem / in phiếu
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    );
  } else if (tab === "kpi") {
    const period = spGet(sp, "period") ?? today.slice(0, 7);
    const items = await prisma.kpiAssignment.findMany({ where: { employeeId: me.id, period }, include: { definition: true, results: { orderBy: { recordedAt: "desc" } } } });
    const periods = await prisma.kpiAssignment.findMany({ where: { employeeId: me.id }, distinct: ["period"], select: { period: true }, orderBy: { period: "desc" } });
    const comps = items.map((a) => ({ a, actual: a.results[0]?.value ?? null, completion: kpiCompletion(a.definition.direction, a.target, a.results[0]?.value) }));
    const score = weightedScore(comps.map((c) => ({ weight: c.a.weight, completion: c.completion })));
    const rating = kpiRating(score);
    body = (
      <Card>
        <CardHeader
          title={`KPI kỳ ${period}`}
          description={score !== null ? `Điểm tổng hợp: ${(score * 100).toFixed(1)}% – ${rating.label}` : "Chưa có kết quả"}
          actions={
            <div className="flex flex-wrap gap-1">
              {periods.map((p) => (
                <Link key={p.period} href={`?tab=kpi&period=${p.period}`} className={cn("rounded-md px-2 py-1 text-xs", p.period === period ? "bg-primary text-primary-foreground" : "bg-muted")}>
                  {p.period}
                </Link>
              ))}
            </div>
          }
        />
        {items.length === 0 ? (
          <EmptyState title="Chưa được giao KPI trong kỳ này" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Chỉ tiêu</TH>
                <TH className="text-right">Mục tiêu</TH>
                <TH className="text-right">Thực tế</TH>
                <TH className="text-right">Hoàn thành</TH>
                <TH className="text-right">Trọng số</TH>
                <TH>Trạng thái</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {comps.map(({ a, actual, completion }) => (
                <TR key={a.id}>
                  <TD>
                    <span className="font-medium">{a.definition.name}</span>
                    <span className="block text-xs text-muted-foreground">{a.definition.unit}{a.definition.direction === "LOWER_BETTER" ? " · càng thấp càng tốt" : ""}</span>
                  </TD>
                  <TD className="tabular text-right">{a.target}</TD>
                  <TD className="tabular text-right">{actual ?? "—"}</TD>
                  <TD className="tabular text-right">{completion !== null ? `${(completion * 100).toFixed(0)}%` : "—"}</TD>
                  <TD className="tabular text-right">{a.weight}</TD>
                  <TD>
                    <Badge tone={KPI_STATUS[a.status].tone}>{KPI_STATUS[a.status].label}</Badge>
                  </TD>
                  <TD className="text-right">
                    {a.status === "OPEN" && (
                      <FormDialog
                        title={`Cập nhật kết quả: ${a.definition.name}`}
                        url={`/api/kpi/assignments/${a.id}/results`}
                        trigger="Cập nhật"
                        triggerVariant="ghost"
                        triggerSize="sm"
                        successMessage="Đã cập nhật kết quả"
                        fields={[
                          { name: "value", label: `Kết quả thực tế (${a.definition.unit})`, type: "number", step: 0.01, required: true, defaultValue: actual },
                          { name: "note", label: "Ghi chú / minh chứng", type: "textarea" },
                        ]}
                      />
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    );
  } else if (tab === "requests") {
    const reqs = await prisma.approvalRequest.findMany({
      where: { employeeId: me.id, type: { in: ["ATTENDANCE_ADJUSTMENT", "OVERTIME"] } },
      include: { steps: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    body = (
      <Card>
        <CardHeader
          title="Đề nghị điều chỉnh công & đăng ký tăng ca"
          actions={
            <>
              <FormDialog
                title="Đề nghị điều chỉnh công"
                description="Dùng khi quên chấm công, chấm sai giờ. Người quản lý sẽ duyệt."
                url="/api/attendance/requests"
                trigger="Điều chỉnh công"
                triggerVariant="outline"
                successMessage="Đã gửi đề nghị"
                fields={[
                  { name: "kind", label: "", type: "hidden", defaultValue: "ADJUSTMENT" },
                  { name: "workDate", label: "Ngày công", type: "date", required: true },
                  { name: "checkIn", label: "Giờ vào đúng", type: "time" },
                  { name: "checkOut", label: "Giờ ra đúng", type: "time" },
                  { name: "checkOutNextDay", label: "Giờ ra thuộc ngày hôm sau (ca đêm)", type: "checkbox" },
                  { name: "reason", label: "Lý do", type: "textarea", required: true },
                ]}
              />
              <FormDialog
                title="Đăng ký tăng ca"
                url="/api/attendance/requests"
                trigger="Đăng ký tăng ca"
                icon="plus"
                successMessage="Đã gửi đăng ký tăng ca"
                fields={[
                  { name: "kind", label: "", type: "hidden", defaultValue: "OVERTIME" },
                  { name: "workDate", label: "Ngày", type: "date", required: true },
                  { name: "start", label: "Từ giờ", type: "time", required: true },
                  { name: "end", label: "Đến giờ", type: "time", required: true, hint: "Nhỏ hơn giờ bắt đầu = qua nửa đêm" },
                  { name: "reason", label: "Nội dung công việc", type: "textarea", required: true },
                ]}
              />
            </>
          }
        />
        {reqs.length === 0 ? (
          <EmptyState title="Chưa có yêu cầu" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Loại</TH>
                <TH>Nội dung</TH>
                <TH className="hidden md:table-cell">Gửi lúc</TH>
                <TH>Trạng thái</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {reqs.map((a) => (
                <TR key={a.id}>
                  <TD>{a.type === "OVERTIME" ? <Badge tone="violet">Tăng ca</Badge> : <Badge tone="blue">Điều chỉnh</Badge>}</TD>
                  <TD>
                    {a.title}
                    {a.steps[0]?.comment && <span className="block text-xs text-muted-foreground">Ý kiến: {a.steps[0].comment}</span>}
                  </TD>
                  <TD className="hidden text-xs md:table-cell">{fmtDateTime(a.createdAt)}</TD>
                  <TD>
                    <Badge tone={REQUEST_STATUS[a.status].tone}>{REQUEST_STATUS[a.status].label}</Badge>
                  </TD>
                  <TD className="text-right">{a.status === "PENDING" && <ActionButton url={`/api/approvals/${a.id}`} body={{ decision: "CANCEL" }} label="Huỷ" variant="ghost" danger confirmTitle="Huỷ yêu cầu này?" successMessage="Đã huỷ" />}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    );
  } else if (tab === "assets") {
    const items = await prisma.assetAssignment.findMany({ where: { employeeId: me.id }, include: { asset: true }, orderBy: { assignedAt: "desc" } });
    body = (
      <Card>
        <CardHeader title="Tài sản được bàn giao" />
        {items.length === 0 ? (
          <EmptyState title="Bạn chưa được bàn giao tài sản nào" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Tài sản</TH>
                <TH>Loại</TH>
                <TH>Ngày nhận</TH>
                <TH>Ngày trả</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((a) => (
                <TR key={a.id}>
                  <TD>
                    <span className="font-medium">{a.asset.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{a.asset.code}</span>
                  </TD>
                  <TD>{ASSET_CATEGORY[a.asset.category]}</TD>
                  <TD>{fmtDate(a.assignedAt)}</TD>
                  <TD>{a.returnedAt ? fmtDate(a.returnedAt) : <Badge tone="blue">Đang giữ</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    );
  } else redirect("/me");

  return (
    <div>
      <PageHeader title={`Xin chào, ${me.fullName.split(" ").slice(-1)[0]}`} description={`${emp.position?.name ?? ""}${emp.department ? ` · ${emp.department.name}` : ""}`} actions={tab === "overview" ? leaveDialog : undefined} />
      <Tabs items={tabs} active={tab} />
      {body}
    </div>
  );
}
