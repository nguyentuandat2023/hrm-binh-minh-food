import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { employeeListWhere } from "@/lib/services/employee";
import { loadScheduleContext, shiftFor } from "@/lib/services/attendance";
import { isOvernight } from "@/lib/attendance-calc";
import { addDays, dayOfWeek, isDateKey, vnDateKey } from "@/lib/dates";
import { orgOptions } from "@/lib/options";
import { fmtDate } from "@/lib/format";
import { spGet, type SP } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, Tabs } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton, FormDialog, type FieldDef } from "@/components/form-dialog";
import { FilterBar } from "@/components/filter-bar";
import { AssignForm, WeekGrid } from "./shift-client";

export const metadata = { title: "Ca làm việc" };

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("attendance.update");
  const sp = await searchParams;
  const tab = spGet(sp, "tab") ?? "schedule";
  const canManageShifts = can(ctx, "attendance.update", "COMPANY");
  const shifts = await prisma.workShift.findMany({ orderBy: [{ isActive: "desc" }, { startTime: "asc" }] });
  const activeShifts = shifts.filter((s) => s.isActive).map((s) => ({ value: s.id, label: `${s.name} (${s.startTime}–${s.endTime})`, color: s.color, short: s.code }));
  const tabs = [
    { key: "schedule", label: "Lịch làm việc tuần", href: "?tab=schedule" },
    { key: "assign", label: "Phân ca", href: "?tab=assign" },
    { key: "shifts", label: "Danh mục ca", href: "?tab=shifts" },
  ];
  const opts = await orgOptions();
  const where = employeeListWhere(ctx, { departmentId: spGet(sp, "department"), q: spGet(sp, "q") }, "attendance.update");

  let body: React.ReactNode;
  if (tab === "shifts") {
    const fields = (s?: (typeof shifts)[number]): FieldDef[] => [
      { name: "code", label: "Mã ca", required: true, defaultValue: s?.code },
      { name: "name", label: "Tên ca", required: true, defaultValue: s?.name },
      { name: "startTime", label: "Giờ bắt đầu", type: "time", required: true, defaultValue: s?.startTime },
      { name: "endTime", label: "Giờ kết thúc", type: "time", required: true, defaultValue: s?.endTime, hint: "Nhỏ hơn giờ bắt đầu = ca qua đêm" },
      { name: "breakMinutes", label: "Nghỉ giữa ca (phút)", type: "number", min: 0, max: 240, defaultValue: s?.breakMinutes ?? 60 },
      { name: "workdayValue", label: "Giá trị công", type: "number", min: 0.1, max: 2, step: 0.1, defaultValue: s?.workdayValue ?? 1 },
      { name: "graceLateMinutes", label: "Cho phép đi muộn (phút)", type: "number", min: 0, max: 120, defaultValue: s?.graceLateMinutes ?? 5 },
      { name: "graceEarlyMinutes", label: "Cho phép về sớm (phút)", type: "number", min: 0, max: 120, defaultValue: s?.graceEarlyMinutes ?? 5 },
      { name: "color", label: "Màu hiển thị (#RRGGBB)", defaultValue: s?.color ?? "#0f766e" },
    ];
    body = (
      <Card>
        <CardHeader title="Danh mục ca làm việc" description="Ca cố định, ca xoay và ca qua đêm" actions={canManageShifts && <FormDialog title="Thêm ca" fields={fields()} url="/api/shifts" trigger="Thêm ca" icon="plus" />} />
        <Table>
          <THead>
            <tr>
              <TH>Ca</TH>
              <TH>Thời gian</TH>
              <TH className="hidden md:table-cell">Nghỉ giữa ca</TH>
              <TH className="hidden md:table-cell">Ngưỡng muộn/sớm</TH>
              <TH>Công</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {shifts.map((s) => (
              <TR key={s.id} className={s.isActive ? undefined : "opacity-50"}>
                <TD>
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span className="size-3 rounded-sm" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <span className="block font-mono text-xs text-muted-foreground">{s.code}</span>
                </TD>
                <TD className="tabular">
                  {s.startTime} – {s.endTime} {isOvernight(s) && <Badge tone="violet">Qua đêm</Badge>}
                </TD>
                <TD className="hidden md:table-cell">{s.breakMinutes} phút</TD>
                <TD className="hidden md:table-cell">
                  {s.graceLateMinutes}/{s.graceEarlyMinutes} phút
                </TD>
                <TD className="tabular">{s.workdayValue}</TD>
                <TD className="text-right">
                  {canManageShifts && (
                    <div className="flex justify-end gap-1">
                      <FormDialog title={`Sửa ca ${s.name}`} fields={fields(s)} url={`/api/shifts/${s.id}`} method="PATCH" trigger="Sửa" triggerVariant="ghost" triggerSize="sm" />
                      <ActionButton url={`/api/shifts/${s.id}`} method="PATCH" body={{ isActive: !s.isActive }} label={s.isActive ? "Ngừng" : "Dùng lại"} variant="ghost" danger={s.isActive} confirmTitle={`${s.isActive ? "Ngừng sử dụng" : "Dùng lại"} ca ${s.name}?`} />
                    </div>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    );
  } else if (tab === "assign") {
    const emps = await prisma.employee.findMany({ where: { AND: [where, { status: { not: "RESIGNED" } }] }, select: { id: true, fullName: true, code: true, department: { select: { name: true } } }, orderBy: { fullName: "asc" } });
    const recent = await prisma.shiftAssignment.findMany({
      where: { employeeId: { in: emps.map((e) => e.id) }, OR: [{ endDate: null }, { endDate: { gte: new Date(vnDateKey() + "T00:00:00Z") } }] },
      include: { employee: { select: { fullName: true } }, shift: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    body = (
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Phân ca hàng loạt" description="Áp dụng cho nhiều nhân viên trong khoảng thời gian, theo thứ trong tuần" />
          <AssignForm employees={emps.map((e) => ({ value: e.id, label: `${e.fullName} (${e.code})`, group: e.department?.name ?? "Khác" }))} shifts={activeShifts} />
        </Card>
        <Card>
          <CardHeader title="Phân ca đang hiệu lực" description="Phân ca mới hơn được ưu tiên; phân ca 1 ngày ưu tiên cao nhất" />
          <div className="max-h-[560px] overflow-y-auto">
            <Table>
              <THead>
                <tr>
                  <TH>Nhân viên</TH>
                  <TH>Ca</TH>
                  <TH>Hiệu lực</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {recent.map((a) => (
                  <TR key={a.id}>
                    <TD>{a.employee.fullName}</TD>
                    <TD>
                      {a.shift?.name ?? <Badge tone="slate">Nghỉ</Badge>}
                      {a.daysOfWeek.length > 0 && <span className="block text-xs text-muted-foreground">{a.daysOfWeek.map((d) => DOW[d]).join(", ")}</span>}
                    </TD>
                    <TD className="text-xs">
                      {fmtDate(a.startDate)} → {a.endDate ? fmtDate(a.endDate) : "không thời hạn"}
                    </TD>
                    <TD>
                      <ActionButton url={`/api/shift-assignments?id=${a.id}`} method="DELETE" label="Xoá" variant="ghost" danger confirmTitle="Xoá phân ca này?" successMessage="Đã xoá phân ca" />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      </div>
    );
  } else {
    const wk = spGet(sp, "week");
    const base = wk && isDateKey(wk) ? wk : vnDateKey();
    const monday = addDays(base, -((dayOfWeek(base) + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    const emps = await prisma.employee.findMany({ where: { AND: [where, { status: { not: "RESIGNED" } }] }, select: { id: true, fullName: true, code: true }, orderBy: { code: "asc" }, take: 200 });
    const sctx = await loadScheduleContext(emps.map((e) => e.id), days[0], days[6]);
    const rows = emps.map((e) => ({
      id: e.id,
      name: e.fullName,
      code: e.code,
      cells: days.map((d) => {
        const s = shiftFor(sctx, e.id, d);
        return { date: d, shiftId: s?.id ?? null, label: s ? s.code : "", color: s?.color ?? null, holiday: sctx.holidays.get(d)?.name ?? null };
      }),
    }));
    body = (
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar filters={[{ name: "q", label: "Tìm nhân viên", type: "search" }, { name: "department", label: "Phòng ban", type: "select", options: opts.departments }, { name: "week", label: "Tuần chứa ngày", type: "date" }]} />
        </div>
        <WeekGrid rows={rows} days={days} shifts={activeShifts} prevWeek={addDays(monday, -7)} nextWeek={addDays(monday, 7)} />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader title="Ca làm việc & lịch làm việc" description="Ca cố định, ca xoay, ca qua đêm. Nhân viên không được phân ca sẽ theo ca mặc định của công ty vào ngày làm việc." />
      <Tabs items={tabs} active={tab} />
      {body}
    </div>
  );
}
