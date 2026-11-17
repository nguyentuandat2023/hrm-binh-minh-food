import Link from "next/link";
import { redirect } from "next/navigation";
import { AlarmClock, Cake, CalendarX, CheckSquare, FileWarning, Plane, UserCheck, UserMinus, UserPlus, Users, Wallet, Hourglass } from "lucide-react";
import type { EmployeeStatus } from "@prisma/client";
import { requirePageAuth } from "@/lib/auth";
import { getDashboard } from "@/lib/services/dashboard";
import { prisma } from "@/lib/db";
import { selectedBranch } from "@/lib/page-ctx";
import { vnDateKey } from "@/lib/dates";
import { fmtDate, fmtVND } from "@/lib/format";
import { EMPLOYEE_STATUS, toOptions } from "@/lib/labels";
import { spGet, type SP } from "@/lib/utils";
import { Card, CardContent, CardHeader, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { FilterBar } from "@/components/filter-bar";
import { BarChartView, LineChartView, ShareBar } from "@/components/charts";

export const metadata = { title: "Tổng quan" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePageAuth();
  if (!ctx.perms["dashboard.view"]) redirect("/me");
  const sp = await searchParams;
  const monthParam = spGet(sp, "month");
  const month = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : vnDateKey().slice(0, 7);
  const status = spGet(sp, "status") as EmployeeStatus | undefined;
  const branchId = spGet(sp, "branch") || (await selectedBranch(ctx, "dashboard.view")) || undefined;
  const departmentId = spGet(sp, "department");

  const [data, departments, branches] = await Promise.all([
    getDashboard(ctx, { month, departmentId, branchId, status: status && status in EMPLOYEE_STATUS ? status : undefined }),
    prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  const s = data.stats;
  const monthLabel = `${month.slice(5)}/${month.slice(0, 4)}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tổng quan nhân sự"
        description={`Số liệu thời gian thực · tháng ${monthLabel}${ctx.perms["dashboard.view"] !== "COMPANY" ? " · trong phạm vi bạn quản lý" : ""}`}
        actions={
          <FilterBar
            filters={[
              { name: "month", label: "Tháng", type: "month", defaultValue: month },
              { name: "department", label: "Phòng ban", type: "select", options: departments.map((d) => ({ value: d.id, label: d.name })) },
              ...(ctx.perms["dashboard.view"] === "COMPANY" ? [{ name: "branch", label: "Chi nhánh", type: "select" as const, options: branches.map((b) => ({ value: b.id, label: b.name })) }] : []),
              { name: "status", label: "Trạng thái", type: "select", options: toOptions(EMPLOYEE_STATUS) },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        <StatCard label="Tổng nhân viên" value={s.total} icon={<Users />} href="/employees" />
        <StatCard label="Đang làm việc" value={s.active} icon={<UserCheck />} tone="blue" href="/employees?status=ACTIVE" />
        <StatCard label="Thử việc" value={s.probation} icon={<Hourglass />} tone="amber" href="/employees?status=PROBATION" />
        <StatCard label={`Tuyển mới T${month.slice(5)}`} value={s.newHires} icon={<UserPlus />} tone="violet" />
        <StatCard label={`Nghỉ việc T${month.slice(5)}`} value={s.leavers} icon={<UserMinus />} tone="slate" />
        <StatCard label="Chờ phê duyệt" value={s.pendingApprovals} icon={<CheckSquare />} tone="amber" href="/approvals" />
        <StatCard label="Nghỉ phép hôm nay" value={s.onLeaveToday} icon={<Plane />} tone="blue" href="/leave" />
        <StatCard label="Đi muộn hôm nay" value={s.lateToday} icon={<AlarmClock />} tone="rose" href="/attendance" />
        <StatCard label="Chưa chấm công" value={s.notCheckedIn} icon={<CalendarX />} tone="rose" hint="Ca đã bắt đầu" href="/attendance" />
        <StatCard label={`HĐ hết hạn ≤ ${data.expiryDays} ngày`} value={s.expiringContracts} icon={<FileWarning />} tone="amber" href="/reports?type=contracts" />
        <StatCard label={`Sinh nhật T${month.slice(5)}`} value={data.birthdays.length} icon={<Cake />} tone="violet" />
        {data.monthCost ? (
          <StatCard
            label={`Chi phí lương T${month.slice(5)}`}
            value={<span className="text-lg">{fmtVND(data.monthCost.value)}</span>}
            icon={<Wallet />}
            hint={data.monthCost.source === "payroll" ? "Từ kỳ lương đã tính (gồm BH DN)" : "Ước tính theo lương cơ bản + phụ cấp"}
            href="/payroll"
          />
        ) : (
          <StatCard label="Tạm nghỉ dài hạn" value={s.leaveOfAbsence} icon={<Users />} tone="slate" />
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Biến động nhân sự 12 tháng" description="Số người tuyển mới và nghỉ việc theo tháng" />
          <CardContent>
            <BarChartView data={data.trend} xKey="month" xLabel="Tháng" series={[{ key: "hires", label: "Tuyển mới" }, { key: "leavers", label: "Nghỉ việc", color: 5 }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Tỷ lệ nghỉ việc theo tháng" description="Số nghỉ việc / quân số bình quân tháng (%)" />
          <CardContent>
            <LineChartView data={data.trend} xKey="month" xLabel="Tháng" fmt="percent" series={[{ key: "turnover", label: "Tỷ lệ nghỉ việc", color: 3 }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Cơ cấu nhân sự theo phòng ban" />
          <CardContent>
            <BarChartView data={data.byDepartment} xKey="name" xLabel="Phòng ban" horizontal height={Math.max(180, data.byDepartment.length * 36)} series={[{ key: "count", label: "Số nhân viên" }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={`Tình hình chấm công tháng ${monthLabel}`} description="Số lượt chấm công theo ngày" />
          <CardContent>
            <BarChartView
              data={data.attendanceDaily}
              xKey="day"
              xLabel="Ngày"
              stacked
              series={[
                { key: "onTime", label: "Đúng giờ" },
                { key: "late", label: "Đi muộn", color: 2 },
                { key: "missing", label: "Thiếu giờ vào/ra", color: 3 },
              ]}
            />
          </CardContent>
        </Card>
        {data.payrollCost && (
          <Card>
            <CardHeader title="Chi phí nhân sự theo kỳ lương" description="Tổng thu nhập và bảo hiểm doanh nghiệp đóng" />
            <CardContent>
              <BarChartView
                data={data.payrollCost}
                xKey="period"
                xLabel="Kỳ lương"
                fmt="vnd"
                stacked
                series={[
                  { key: "gross", label: "Tổng thu nhập" },
                  { key: "employer", label: "BH doanh nghiệp đóng", color: 1 },
                ]}
              />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader title={`Hoàn thành KPI tháng ${monthLabel}`} description="Tỷ lệ hoàn thành bình quân theo phòng ban (%)" />
          <CardContent>
            <BarChartView data={data.kpiByDepartment} xKey="name" xLabel="Phòng ban" fmt="percent" series={[{ key: "completion", label: "% hoàn thành", color: 4 }]} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Tỷ lệ giới tính" description="Theo dữ liệu nhân viên tự khai báo" />
          <CardContent>
            <ShareBar
              parts={[
                { label: "Nam", value: data.gender.male },
                { label: "Nữ", value: data.gender.female, color: 1 },
                { label: "Khác/không khai báo", value: data.gender.other, color: 5 },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={`Hợp đồng sắp hết hạn (${data.expiryDays} ngày)`} />
          <CardContent className="space-y-2 text-sm">
            {data.expiringContracts.length === 0 && <p className="text-muted-foreground">Không có hợp đồng sắp hết hạn</p>}
            {data.expiringContracts.map((c) => (
              <Link key={c.id} href={`/employees/${c.employee.id}?tab=contracts`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                <span className="truncate">
                  {c.employee.fullName} <span className="text-muted-foreground">· {c.code}</span>
                </span>
                <span className="shrink-0 text-amber-600 dark:text-amber-400">{fmtDate(c.endDate)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader title={`Sinh nhật tháng ${month.slice(5)}`} />
          <CardContent className="space-y-2 text-sm">
            {data.birthdays.length === 0 && <p className="text-muted-foreground">Không có sinh nhật trong tháng</p>}
            {data.birthdays.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 px-2 py-1">
                <span className="truncate">
                  {b.fullName} <span className="text-muted-foreground">· {b.department}</span>
                </span>
                <span className="shrink-0 tabular">
                  {String(b.day).padStart(2, "0")}/{month.slice(5)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
