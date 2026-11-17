import { prisma } from "@/lib/db";
import { api, fileResponse, searchParams } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { employeeListWhere, listSelect } from "@/lib/services/employee";
import { buildWorkbook, XLSX_MIME } from "@/lib/excel";
import { EMPLOYEE_STATUS, EMPLOYMENT_TYPE } from "@/lib/labels";
import { fmtDate } from "@/lib/format";
import { vnDateKey } from "@/lib/dates";
import { audit } from "@/lib/audit";

/** Xuất danh sách nhân viên (thông tin công việc – không kèm dữ liệu nhạy cảm) */
export const GET = api(async (req, { ctx }) => {
  requirePerm(ctx, "employee.export");
  const sp = searchParams(req);
  const where = employeeListWhere(ctx, { q: sp.q, departmentId: sp.department, positionId: sp.position, branchId: sp.branch, status: sp.status, includeInactive: sp.inactive === "1" }, "employee.export");
  const items = await prisma.employee.findMany({ where, select: listSelect, orderBy: { code: "asc" } });
  const buf = await buildWorkbook([
    {
      name: "Nhân viên",
      title: `Danh sách nhân viên – xuất ngày ${fmtDate(vnDateKey())}`,
      columns: [
        { header: "Mã NV", key: "code", width: 10 },
        { header: "Họ tên", key: "fullName", width: 26 },
        { header: "Phòng ban", key: "department", width: 24 },
        { header: "Chức vụ", key: "position", width: 22 },
        { header: "Chi nhánh", key: "branch", width: 18 },
        { header: "Quản lý trực tiếp", key: "manager", width: 22 },
        { header: "Email", key: "email", width: 28 },
        { header: "Điện thoại", key: "phone", width: 14 },
        { header: "Ngày vào làm", key: "startDate", width: 13 },
        { header: "Loại hình", key: "type", width: 16 },
        { header: "Trạng thái", key: "status", width: 16 },
      ],
      rows: items.map((e) => ({
        code: e.code,
        fullName: e.fullName,
        department: e.department?.name ?? "",
        position: e.position?.name ?? "",
        branch: e.branch?.name ?? "",
        manager: e.manager?.fullName ?? "",
        email: e.email ?? "",
        phone: e.phone ?? "",
        startDate: fmtDate(e.startDate),
        type: EMPLOYMENT_TYPE[e.employmentType],
        status: (e.deactivatedAt ? "Ngừng kích hoạt – " : "") + EMPLOYEE_STATUS[e.status].label,
      })),
    },
  ]);
  await audit(ctx, { action: "EXPORT", entityType: "Employee", summary: `Xuất Excel danh sách nhân viên (${items.length} dòng)` }, req);
  return fileResponse(buf, `danh-sach-nhan-vien-${vnDateKey()}.xlsx`, XLSX_MIME);
});
