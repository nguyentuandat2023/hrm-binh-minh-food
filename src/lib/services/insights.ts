// HR Insights – quy tắc có thể giải thích, tính trên dữ liệu trong phạm vi quyền của người xem.
// Không dùng dịch vụ AI bên ngoài, không suy đoán thuộc tính nhạy cảm, không tự ra quyết định nhân sự.
import { prisma } from "../db";
import { employeeScopeWhere, type AuthCtx } from "../rbac";
import { addDays, dbDate, keyOf, monthRange, vnDateKey, vnMinutesOfDay, yearsBetween } from "../dates";
import { buildTimesheet } from "./attendance";
import { decrypt } from "../crypto";
import { fmtDate } from "../format";
import { PRIVILEGED_ROLES } from "../permissions";

export interface Insight {
  severity: "high" | "medium" | "low";
  title: string;
  why: string;
  items: { label: string; detail?: string; href?: string }[];
}

export async function buildInsights(ctx: AuthCtx) {
  const today = vnDateKey();
  const scope = employeeScopeWhere(ctx, "insights.view");
  const emps = await prisma.employee.findMany({
    where: { AND: [scope, { deactivatedAt: null, status: { not: "RESIGNED" } }] },
    select: {
      id: true,
      code: true,
      fullName: true,
      dateOfBirth: true,
      nationalIdEnc: true,
      emergencyName: true,
      emergencyPhone: true,
      departmentId: true,
      positionId: true,
      email: true,
      phone: true,
      status: true,
      probationEndDate: true,
      department: { select: { name: true } },
      salaryProfile: { select: { bankAccountEnc: true, baseSalary: true } },
      contracts: { where: { status: "ACTIVE" }, select: { id: true } },
      user: { select: { id: true } },
    },
  });
  const ids = emps.map((e) => e.id);
  const insights: Insight[] = [];
  const link = (id: string) => `/employees/${id}`;

  // 1. Bất thường chấm công 30 ngày
  const from = addDays(today, -30);
  const rows = await buildTimesheet(emps.map((e) => ({ id: e.id, code: e.code, fullName: e.fullName, department: e.department })), from, addDays(today, -1), today);
  const lateMany = rows.filter((r) => r.totals.lateCount >= 4).sort((a, b) => b.totals.lateCount - a.totals.lateCount);
  const missingMany = rows.filter((r) => r.totals.missing >= 2);
  const absentMany = rows.filter((r) => r.totals.absent >= 2);
  const recs = await prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: { gte: dbDate(from) } }, select: { employeeId: true, workDate: true, checkInAt: true, workedMinutes: true, checkOutAt: true } });
  const oddHours = recs.filter((r) => r.checkInAt && r.checkOutAt && r.checkOutAt.getTime() - r.checkInAt.getTime() > 14 * 3600_000);
  const ots = await prisma.overtimeRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", workDate: { gte: dbDate(from) } }, select: { employeeId: true, workDate: true } });
  const nameOf = (id: string) => emps.find((e) => e.id === id)?.fullName ?? id;
  const anomalies: Insight["items"] = [
    ...lateMany.slice(0, 10).map((r) => ({ label: r.employee.fullName, detail: `Đi muộn ${r.totals.lateCount} lần (${r.totals.lateMinutes} phút) trong 30 ngày`, href: link(r.employee.id) })),
    ...missingMany.slice(0, 10).map((r) => ({ label: r.employee.fullName, detail: `${r.totals.missing} ngày thiếu giờ vào/ra chưa điều chỉnh`, href: link(r.employee.id) })),
    ...absentMany.slice(0, 10).map((r) => ({ label: r.employee.fullName, detail: `${r.totals.absent} ngày có lịch làm nhưng không chấm công, không có đơn nghỉ`, href: link(r.employee.id) })),
    ...oddHours
      .filter((r) => !ots.some((o) => o.employeeId === r.employeeId && keyOf(o.workDate) === keyOf(r.workDate)))
      .slice(0, 10)
      .map((r) => ({ label: nameOf(r.employeeId), detail: `Ngày ${fmtDate(r.workDate)}: có mặt > 14 giờ nhưng không có đơn tăng ca được duyệt (vào ${r.checkInAt ? Math.floor(vnMinutesOfDay(r.checkInAt) / 60) : "?"}h)`, href: link(r.employeeId) })),
  ];
  if (anomalies.length)
    insights.push({ severity: "medium", title: "Bất thường trong bảng công (30 ngày)", why: "Quy tắc: ≥4 lần đi muộn, ≥2 ngày thiếu giờ vào/ra, ≥2 ngày vắng không có đơn, hoặc có mặt >14 giờ/ngày không có đơn tăng ca. Cần quản lý xác minh nguyên nhân trước khi xử lý.", items: anomalies });

  // 2. Hợp đồng
  const contracts = await prisma.employmentContract.findMany({ where: { employeeId: { in: ids }, status: { in: ["ACTIVE", "EXPIRED"] }, endDate: { lte: dbDate(addDays(today, 30)) } }, include: { employee: { select: { id: true, fullName: true } } }, orderBy: { endDate: "asc" } });
  const noContract = emps.filter((e) => e.contracts.length === 0);
  const cItems: Insight["items"] = [
    ...contracts.map((c) => ({ label: c.employee.fullName, detail: `${c.code} ${keyOf(c.endDate)! < today || c.status === "EXPIRED" ? "ĐÃ HẾT HẠN" : "hết hạn"} ${fmtDate(c.endDate)}`, href: `${link(c.employee.id)}?tab=contracts` })),
    ...noContract.slice(0, 20).map((e) => ({ label: e.fullName, detail: "Chưa có hợp đồng lao động đang hiệu lực trên hệ thống", href: `${link(e.id)}?tab=contracts` })),
  ];
  if (cItems.length) insights.push({ severity: contracts.some((c) => keyOf(c.endDate)! < today || c.status === "EXPIRED") || noContract.length ? "high" : "medium", title: "Hợp đồng cần xử lý", why: "Hợp đồng hết hạn trong 30 ngày, đã hết hạn chưa gia hạn, hoặc nhân viên chưa có hợp đồng hiệu lực. HR cần rà soát và quyết định gia hạn/ký mới.", items: cItems });

  // 3. Thiếu thông tin hồ sơ
  const missingProfile = emps
    .map((e) => {
      const miss: string[] = [];
      if (!e.dateOfBirth) miss.push("ngày sinh");
      if (!e.nationalIdEnc) miss.push("CCCD");
      if (!e.emergencyName || !e.emergencyPhone) miss.push("liên hệ khẩn cấp");
      if (!e.departmentId) miss.push("phòng ban");
      if (!e.positionId) miss.push("chức vụ");
      if (!e.email && !e.phone) miss.push("thông tin liên lạc");
      if (!e.salaryProfile || e.salaryProfile.baseSalary <= 0) miss.push("thông tin lương");
      else if (!decrypt(e.salaryProfile.bankAccountEnc)) miss.push("tài khoản ngân hàng");
      if (!e.user) miss.push("tài khoản đăng nhập");
      return { e, miss };
    })
    .filter((x) => x.miss.length);
  if (missingProfile.length)
    insights.push({ severity: "low", title: `Hồ sơ thiếu thông tin (${missingProfile.length} nhân viên)`, why: "Các trường cần thiết cho chấm công, tính lương, BHXH và liên hệ khẩn cấp còn trống.", items: missingProfile.slice(0, 30).map(({ e, miss }) => ({ label: e.fullName, detail: `Thiếu: ${miss.join(", ")}`, href: link(e.id) })) });

  // 4. Xu hướng nghỉ việc 12 tháng
  const leavers = await prisma.employee.findMany({ where: { AND: [scope, { status: "RESIGNED", endDate: { gte: dbDate(addDays(today, -365)) } }] }, select: { endDate: true, startDate: true, department: { select: { name: true } } } });
  const all = await prisma.employee.findMany({ where: scope, select: { startDate: true, endDate: true } });
  const monthly: { month: string; leavers: number; headcount: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - i, 1));
    const r = monthRange(d.getUTCFullYear(), d.getUTCMonth() + 1);
    monthly.push({
      month: `${r.from.slice(5, 7)}/${r.from.slice(2, 4)}`,
      leavers: leavers.filter((l) => keyOf(l.endDate)! >= r.from && keyOf(l.endDate)! <= r.to).length,
      headcount: all.filter((e) => keyOf(e.startDate)! <= r.to && (!e.endDate || keyOf(e.endDate)! >= r.to)).length,
    });
  }
  const byDept = new Map<string, number>();
  for (const l of leavers) byDept.set(l.department?.name ?? "Khác", (byDept.get(l.department?.name ?? "Khác") ?? 0) + 1);
  const avgTenure = leavers.length ? Math.round((leavers.reduce((s, l) => s + yearsBetween(keyOf(l.startDate)!, keyOf(l.endDate)!), 0) / leavers.length) * 10) / 10 : null;
  const first6 = monthly.slice(0, 6).reduce((s, m) => s + m.leavers, 0);
  const last6 = monthly.slice(6).reduce((s, m) => s + m.leavers, 0);

  // 5. Việc hành chính cần xử lý
  const [pendingApprovals, overdueTasks, prevPeriod, balancesThisYear, holidaysNextYear, privilegedNoMfa, missingOut] = await Promise.all([
    prisma.approvalRequest.count({ where: { status: "PENDING", employeeId: { in: ids } } }),
    prisma.lifecycleTask.count({ where: { doneAt: null, dueDate: { lt: dbDate(today) }, checklist: { status: "IN_PROGRESS", employeeId: { in: ids } } } }),
    prisma.payrollPeriod.findUnique({ where: { code: new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7) } }),
    prisma.leaveBalance.count({ where: { year: Number(today.slice(0, 4)), employeeId: { in: ids } } }),
    prisma.holiday.count({ where: { date: { gte: dbDate(`${Number(today.slice(0, 4)) + 1}-01-01`) } } }),
    ctx.perms["admin_user.view"] ? prisma.user.count({ where: { isActive: true, totpEnabled: false, roles: { some: { role: { key: { in: PRIVILEGED_ROLES } } } } } }) : Promise.resolve(0),
    prisma.attendanceRecord.count({ where: { employeeId: { in: ids }, checkOutAt: null, workDate: { lt: dbDate(today), gte: dbDate(from) } } }),
  ]);
  const probationSoon = emps.filter((e) => e.status === "PROBATION" && e.probationEndDate && keyOf(e.probationEndDate)! <= addDays(today, 14));
  const todos: Insight["items"] = [];
  if (pendingApprovals) todos.push({ label: `${pendingApprovals} yêu cầu đang chờ phê duyệt`, href: "/approvals" });
  if (probationSoon.length) todos.push({ label: `${probationSoon.length} nhân viên sắp hết thử việc – cần đánh giá`, detail: probationSoon.map((e) => e.fullName).join(", "), href: "/employees?status=PROBATION" });
  if (overdueTasks) todos.push({ label: `${overdueTasks} đầu việc tiếp nhận/nghỉ việc quá hạn`, href: "/lifecycle" });
  if (missingOut) todos.push({ label: `${missingOut} ngày công thiếu giờ ra trong 30 ngày`, detail: "Nhắc nhân viên gửi đề nghị điều chỉnh trước khi chốt lương", href: "/attendance?tab=timesheet" });
  if (ctx.perms["payroll.view"] && !prevPeriod) todos.push({ label: "Chưa tạo kỳ lương tháng trước", href: "/payroll" });
  if (ctx.perms["leave.update"] === "COMPANY" && balancesThisYear < ids.length) todos.push({ label: "Chưa khởi tạo đủ số ngày phép năm nay", href: "/leave?tab=balances" });
  if (ctx.perms["leave.update"] === "COMPANY" && today.slice(5) >= "11-01" && holidaysNextYear < 5) todos.push({ label: "Chưa cập nhật lịch nghỉ lễ năm sau (Tết Nguyên đán, Giỗ Tổ…)", href: "/settings/holidays" });
  if (privilegedNoMfa) todos.push({ label: `${privilegedNoMfa} tài khoản đặc quyền chưa bật xác thực hai lớp`, href: "/settings/users" });
  if (todos.length) insights.unshift({ severity: "high", title: "Việc hành chính cần xử lý", why: "Tổng hợp tự động từ trạng thái dữ liệu hiện tại.", items: todos });

  // 6. Tóm tắt tự động (mẫu câu, không dùng AI)
  const thisMonth = today.slice(0, 7);
  const hires = await prisma.employee.count({ where: { AND: [scope, { startDate: { gte: dbDate(thisMonth + "-01") } }] } });
  const lateTotal = rows.reduce((s, r) => s + r.totals.lateCount, 0);
  const summary = [
    `Hiện có ${emps.length} nhân viên đang làm việc trong phạm vi của bạn (${emps.filter((e) => e.status === "PROBATION").length} đang thử việc).`,
    `Tháng ${thisMonth.slice(5)}/${thisMonth.slice(0, 4)} có ${hires} nhân viên mới; 12 tháng qua có ${leavers.length} người nghỉ việc${avgTenure !== null ? `, thâm niên bình quân khi nghỉ ${avgTenure} năm` : ""}.`,
    `Số người nghỉ việc 6 tháng gần nhất là ${last6} so với ${first6} của 6 tháng trước đó${last6 > first6 ? " – có xu hướng tăng, nên tìm hiểu nguyên nhân (khảo sát, phỏng vấn nghỉ việc)" : last6 < first6 ? " – xu hướng giảm" : ""}.`,
    `30 ngày qua ghi nhận ${lateTotal} lượt đi muộn${lateMany.length ? `, ${lateMany.length} người đi muộn từ 4 lần trở lên` : ""}.`,
    `${contracts.length} hợp đồng cần xử lý trong 30 ngày tới; ${missingProfile.length} hồ sơ còn thiếu thông tin.`,
  ];

  return { insights, summary, turnover: { monthly, byDept: [...byDept.entries()].map(([name, count]) => ({ name, count })), avgTenure } };
}
