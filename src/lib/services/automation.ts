// Tác vụ tự động hằng ngày – chạy lặp lại an toàn (dedupeKey chống tạo thông báo trùng).
// Chỉ tạo THÔNG BÁO TRONG ỨNG DỤNG; không gửi email/kênh ngoài khi chưa cấu hình tích hợp.
// Không tự động ra quyết định nhân sự (không tự chấm dứt HĐ, không tự duyệt).
import { prisma } from "../db";
import { addDays, dbDate, keyOf, vnDateKey, vnDateTime, vnMinutesOfDay, parseHHmm } from "../dates";
import { getSetting } from "../settings";
import { notifyEmployee, notifyUsers, usersWithPerm, usersWithPermFor } from "../notify";
import { loadScheduleContext, shiftFor } from "./attendance";
import { audit } from "../audit";
import { fmtDate } from "../format";

export interface JobResult {
  [k: string]: number;
}

export async function runDailyJobs(now = new Date(), actorUserId: string | null = null): Promise<JobResult> {
  const today = vnDateKey(now);
  const year = today.slice(0, 4);
  const notif = await getSetting("notifications");
  const att = await getSetting("attendance");
  const r: JobResult = { contracts: 0, probation: 0, birthdays: 0, missingIn: 0, missingOut: 0, approvalReminders: 0, kpi: 0, lifecycle: 0, expiredContracts: 0, sessionsCleaned: 0 };
  const hrUsers = await usersWithPerm("contract.update");

  // 1. Hợp đồng sắp hết hạn → HR + quản lý trực tiếp
  const limit = addDays(today, notif.contractExpiryDays);
  const contracts = await prisma.employmentContract.findMany({
    where: { status: "ACTIVE", endDate: { gte: dbDate(today), lte: dbDate(limit) }, employee: { deactivatedAt: null, status: { not: "RESIGNED" } } },
    include: { employee: { select: { id: true, fullName: true, managerId: true } } },
  });
  for (const c of contracts) {
    const mgrUser = c.employee.managerId ? await prisma.user.findUnique({ where: { employeeId: c.employee.managerId }, select: { id: true } }) : null;
    r.contracts += await notifyUsers([...hrUsers, ...(mgrUser ? [mgrUser.id] : [])], {
      type: "CONTRACT_EXPIRING",
      title: "Hợp đồng sắp hết hạn",
      body: `${c.employee.fullName} – HĐ ${c.code} hết hạn ${fmtDate(c.endDate)}`,
      link: `/employees/${c.employee.id}?tab=contracts`,
      dedupeKey: `contract:${c.id}:${keyOf(c.endDate)}`,
    });
  }

  // 2. Hợp đồng đã quá hạn → đánh dấu "Hết hạn" (bảo trì dữ liệu, không thay đổi trạng thái nhân viên)
  const exp = await prisma.employmentContract.updateMany({ where: { status: "ACTIVE", endDate: { lt: dbDate(today) } }, data: { status: "EXPIRED" } });
  r.expiredContracts = exp.count;

  // 3. Sắp hết thử việc
  const probation = await prisma.employee.findMany({
    where: { status: "PROBATION", deactivatedAt: null, probationEndDate: { gte: dbDate(today), lte: dbDate(addDays(today, notif.probationEndDays)) } },
    select: { id: true, fullName: true, managerId: true, probationEndDate: true },
  });
  for (const e of probation) {
    const mgrUser = e.managerId ? await prisma.user.findUnique({ where: { employeeId: e.managerId }, select: { id: true } }) : null;
    r.probation += await notifyUsers([...hrUsers, ...(mgrUser ? [mgrUser.id] : [])], {
      type: "PROBATION_ENDING",
      title: "Sắp kết thúc thử việc – cần đánh giá",
      body: `${e.fullName} kết thúc thử việc ngày ${fmtDate(e.probationEndDate)}`,
      link: `/employees/${e.id}`,
      dedupeKey: `probation:${e.id}:${keyOf(e.probationEndDate)}`,
    });
  }

  // 4. Sinh nhật hôm nay
  if (notif.birthdayEnabled) {
    const md = today.slice(5);
    const emps = await prisma.employee.findMany({ where: { deactivatedAt: null, status: { not: "RESIGNED" }, dateOfBirth: { not: null } }, select: { id: true, fullName: true, dateOfBirth: true, managerId: true } });
    for (const e of emps.filter((x) => keyOf(x.dateOfBirth)!.slice(5) === md)) {
      await notifyEmployee(e.id, { type: "BIRTHDAY", title: "Chúc mừng sinh nhật! 🎉", body: "Chúc bạn một ngày sinh nhật vui vẻ và nhiều thành công.", dedupeKey: `birthday-self:${e.id}:${year}` });
      const mgrUser = e.managerId ? await prisma.user.findUnique({ where: { employeeId: e.managerId }, select: { id: true } }) : null;
      r.birthdays += await notifyUsers([...hrUsers, ...(mgrUser ? [mgrUser.id] : [])], { type: "BIRTHDAY", title: "Sinh nhật nhân viên hôm nay", body: e.fullName, link: `/employees/${e.id}`, dedupeKey: `birthday:${e.id}:${year}` });
    }
  }

  // 5. Thiếu chấm công: nhắc sau giờ cấu hình (mặc định 10:00) và nhắc thiếu giờ ra của hôm qua
  if (notif.missingCheckinEnabled) {
    const active = await prisma.employee.findMany({ where: { deactivatedAt: null, status: { not: "RESIGNED" }, user: { isNot: null } }, select: { id: true } });
    const ids = active.map((e) => e.id);
    if (vnMinutesOfDay(now) >= parseHHmm(att.missingCheckinReminderAt)) {
      const sctx = await loadScheduleContext(ids, today, today);
      const [recs, leaves] = await Promise.all([
        prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: dbDate(today) }, select: { employeeId: true, checkInAt: true } }),
        prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", startDate: { lte: dbDate(today) }, endDate: { gte: dbDate(today) } }, select: { employeeId: true } }),
      ]);
      const done = new Set(recs.filter((x) => x.checkInAt).map((x) => x.employeeId));
      const off = new Set(leaves.map((l) => l.employeeId));
      for (const id of ids) {
        const s = shiftFor(sctx, id, today);
        if (!s || sctx.holidays.has(today) || done.has(id) || off.has(id)) continue;
        if (vnDateTime(today, s.startTime) > now) continue;
        await notifyEmployee(id, { type: "MISSING_CHECKIN", title: "Bạn chưa chấm công vào hôm nay", body: `Ca ${s.name} bắt đầu lúc ${s.startTime}. Nếu đã làm việc, hãy chấm công hoặc gửi đề nghị điều chỉnh.`, link: "/me", dedupeKey: `missing-in:${id}:${today}` });
        r.missingIn++;
      }
    }
    const yesterday = addDays(today, -1);
    const openY = await prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, workDate: dbDate(yesterday), checkInAt: { not: null }, checkOutAt: null }, select: { employeeId: true } });
    for (const o of openY) {
      // Ca qua đêm của hôm qua có thể chưa kết thúc – chỉ nhắc sau 12:00 hôm nay
      if (vnMinutesOfDay(now) < 12 * 60) break;
      await notifyEmployee(o.employeeId, { type: "MISSING_CHECKOUT", title: "Thiếu giờ ra ngày hôm qua", body: `Ngày ${fmtDate(yesterday)} chưa có giờ ra. Hãy gửi đề nghị điều chỉnh công.`, link: "/me?tab=requests", dedupeKey: `missing-out:${o.employeeId}:${yesterday}` });
      r.missingOut++;
    }
  }

  // 6. Nhắc duyệt yêu cầu tồn quá 2 ngày
  const stale = await prisma.approvalRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 2 * 86400_000) } },
    include: { employee: { select: { id: true, departmentId: true, branchId: true, managerId: true, fullName: true } } },
  });
  const permOf = { LEAVE: "leave.approve", ATTENDANCE_ADJUSTMENT: "attendance.approve", OVERTIME: "attendance.approve" } as const;
  for (const a of stale) {
    const users = await usersWithPermFor(permOf[a.type], a.employee, { minCompany: a.currentLevel > 1 });
    r.approvalReminders += await notifyUsers(users, { type: "APPROVAL_REMINDER", title: "Nhắc: yêu cầu chờ duyệt quá 2 ngày", body: `${a.employee.fullName}: ${a.title}`, link: "/approvals", dedupeKey: `remind:${a.id}:${today}` });
  }

  // 7. Kỳ KPI: từ ngày 25 nhắc nhân viên cập nhật kết quả KPI tháng hiện tại
  if (Number(today.slice(8)) >= 25) {
    const open = await prisma.kpiAssignment.findMany({ where: { period: today.slice(0, 7), status: "OPEN", employeeId: { not: null } }, select: { employeeId: true } });
    for (const empId of new Set(open.map((o) => o.employeeId!))) {
      await notifyEmployee(empId, { type: "KPI_PERIOD", title: "Sắp kết thúc kỳ KPI", body: `Vui lòng cập nhật kết quả KPI tháng ${today.slice(5, 7)}/${year}.`, link: "/me?tab=kpi", dedupeKey: `kpi:${empId}:${today.slice(0, 7)}` });
      r.kpi++;
    }
  }

  // 8. Đầu việc tiếp nhận/nghỉ việc quá hạn → người được giao
  const overdue = await prisma.lifecycleTask.findMany({ where: { doneAt: null, dueDate: { lt: dbDate(today) }, assigneeId: { not: null }, checklist: { status: "IN_PROGRESS" } }, include: { checklist: { include: { employee: { select: { fullName: true } } } } } });
  for (const t of overdue) {
    await notifyEmployee(t.assigneeId!, { type: "TASK_OVERDUE", title: "Đầu việc quá hạn", body: `${t.title} (${t.checklist.type === "ONBOARDING" ? "tiếp nhận" : "nghỉ việc"} – ${t.checklist.employee.fullName})`, link: `/lifecycle/${t.checklistId}`, dedupeKey: `task:${t.id}:${today}` });
    r.lifecycle++;
  }

  // 9. Dọn phiên đăng nhập hết hạn > 30 ngày
  const cleaned = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 30 * 86400_000) } } });
  r.sessionsCleaned = cleaned.count;

  await audit(actorUserId ? { userId: actorUserId } : null, { action: "JOB_RUN", entityType: "Automation", summary: `Tác vụ tự động: ${Object.entries(r).map(([k, v]) => `${k}=${v}`).join(", ")}` });
  return r;
}
