import { prisma } from "@/lib/db";
import { api, fileResponse, searchParams } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { employeeListWhere } from "@/lib/services/employee";
import { buildTimesheet } from "@/lib/services/attendance";
import { DAY_STATUS_META } from "@/lib/attendance-calc";
import { monthRange, vnDateKey } from "@/lib/dates";
import { buildWorkbook, XLSX_MIME } from "@/lib/excel";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

/** Xuất bảng công tháng ra Excel */
export const GET = api(async (req, { ctx }) => {
  requirePerm(ctx, "attendance.export");
  const sp = searchParams(req);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : vnDateKey().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const range = monthRange(y, m);
  const where = employeeListWhere(ctx, { q: sp.q, departmentId: sp.department, branchId: sp.branch }, "attendance.export");
  const emps = await prisma.employee.findMany({
    where: { AND: [where, { startDate: { lte: new Date(range.to) } }, { OR: [{ endDate: null }, { endDate: { gte: new Date(range.from) } }] }] },
    select: { id: true, code: true, fullName: true, department: { select: { name: true } } },
    orderBy: { code: "asc" },
  });
  if (emps.length > 3000) throw new HttpError(400, "Quá nhiều nhân viên – hãy lọc theo phòng ban/chi nhánh");
  const rows = await buildTimesheet(emps, range.from, range.to);
  const dayCols = Array.from({ length: range.days }, (_, i) => ({ header: String(i + 1), key: `d${i + 1}`, width: 5 }));
  const buf = await buildWorkbook([
    {
      name: `Cong ${m}-${y}`,
      title: `BẢNG CHẤM CÔNG THÁNG ${String(m).padStart(2, "0")}/${y}`,
      columns: [
        { header: "Mã NV", key: "code", width: 9 },
        { header: "Họ tên", key: "name", width: 24 },
        { header: "Phòng ban", key: "dept", width: 20 },
        ...dayCols,
        { header: "Công thực tế", key: "workdays", width: 10 },
        { header: "Phép có lương", key: "paidLeave", width: 10 },
        { header: "Nghỉ không lương", key: "unpaid", width: 10 },
        { header: "Ngày lễ", key: "holidays", width: 8 },
        { header: "Đi muộn (lần)", key: "late", width: 9 },
        { header: "Phút muộn", key: "lateMin", width: 9 },
        { header: "Vắng", key: "absent", width: 7 },
        { header: "Thiếu giờ vào/ra", key: "missing", width: 9 },
        { header: "Tăng ca (giờ)", key: "ot", width: 9 },
      ],
      rows: rows.map((r) => ({
        code: r.employee.code,
        name: r.employee.fullName,
        dept: r.employee.department ?? "",
        ...Object.fromEntries(r.cells.map((c, i) => [`d${i + 1}`, c.status === "FULL" || c.status === "PARTIAL" ? c.value : DAY_STATUS_META[c.status].short])),
        workdays: r.totals.workdays,
        paidLeave: r.totals.paidLeave,
        unpaid: r.totals.unpaidLeave,
        holidays: r.totals.holidays,
        late: r.totals.lateCount,
        lateMin: r.totals.lateMinutes,
        absent: r.totals.absent,
        missing: r.totals.missing,
        ot: Math.round((r.totals.otMinutes / 60) * 100) / 100,
      })),
    },
    {
      name: "Chú thích",
      columns: [{ header: "Ký hiệu", key: "k", width: 10 }, { header: "Ý nghĩa", key: "v", width: 30 }],
      rows: [{ k: "số", v: "Số công trong ngày (1 = đủ công)" }, ...Object.values(DAY_STATUS_META).filter((x) => x.short && !["✓", "½"].includes(x.short)).map((x) => ({ k: x.short, v: x.label }))],
    },
  ]);
  await audit(ctx, { action: "EXPORT", entityType: "Attendance", summary: `Xuất bảng công ${month} (${rows.length} nhân viên)` }, req);
  return fileResponse(buf, `bang-cong-${month}.xlsx`, XLSX_MIME);
});
