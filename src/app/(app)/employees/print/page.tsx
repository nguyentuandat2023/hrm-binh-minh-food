import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { employeeListWhere, listSelect } from "@/lib/services/employee";
import { getSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { EMPLOYEE_STATUS } from "@/lib/labels";
import { spGet, type SP } from "@/lib/utils";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "In danh sách nhân viên" };

/** Bản in / lưu PDF bằng trình duyệt (giữ đúng font tiếng Việt) */
export default async function PrintEmployees({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("employee.export");
  const sp = await searchParams;
  const where = employeeListWhere(ctx, { q: spGet(sp, "q"), departmentId: spGet(sp, "department"), positionId: spGet(sp, "position"), branchId: spGet(sp, "branch"), status: spGet(sp, "status"), includeInactive: spGet(sp, "inactive") === "1" }, "employee.export");
  const [items, company] = await Promise.all([prisma.employee.findMany({ where, select: listSelect, orderBy: { code: "asc" } }), getSetting("company")]);
  await audit(ctx, { action: "EXPORT", entityType: "Employee", summary: `In/PDF danh sách nhân viên (${items.length} dòng)` });
  return (
    <div className="print-area rounded-xl border border-border bg-white p-6 text-black">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton />
      </div>
      <p className="text-sm font-semibold">{company.name}</p>
      <h1 className="my-3 text-center text-lg font-bold uppercase">Danh sách nhân viên</h1>
      <p className="mb-3 text-center text-xs">In lúc {fmtDateTime(new Date())} · {items.length} nhân viên</p>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {["STT", "Mã NV", "Họ tên", "Phòng ban", "Chức vụ", "Ngày vào làm", "Trạng thái"].map((h) => (
              <th key={h} className="border border-black px-2 py-1 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((e, i) => (
            <tr key={e.id}>
              <td className="border border-black px-2 py-1">{i + 1}</td>
              <td className="border border-black px-2 py-1">{e.code}</td>
              <td className="border border-black px-2 py-1">{e.fullName}</td>
              <td className="border border-black px-2 py-1">{e.department?.name}</td>
              <td className="border border-black px-2 py-1">{e.position?.name}</td>
              <td className="border border-black px-2 py-1">{fmtDate(e.startDate)}</td>
              <td className="border border-black px-2 py-1">{EMPLOYEE_STATUS[e.status].label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
