import { prisma } from "@/lib/db";
import { api, pageParams, parseBody, searchParams } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { createEmployee, createEmployeeSchema, employeeListWhere, listSelect } from "@/lib/services/employee";

/** GET /api/employees – danh sách nhân viên trong phạm vi quyền, có tìm kiếm/lọc/phân trang */
export const GET = api(async (req, { ctx }) => {
  requirePerm(ctx, "employee.view");
  const sp = searchParams(req);
  const { page, size, skip, take } = pageParams(sp);
  const where = employeeListWhere(ctx, {
    q: sp.q,
    departmentId: sp.department,
    positionId: sp.position,
    branchId: sp.branch,
    status: sp.status,
    includeInactive: sp.inactive === "1",
  });
  const [total, items] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({ where, select: listSelect, orderBy: [{ code: "asc" }], skip, take }),
  ]);
  return { total, page, size, items };
});

/** POST /api/employees – thêm nhân viên (mã tự sinh) */
export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "employee.create");
  const input = await parseBody(req, createEmployeeSchema);
  const e = await createEmployee(ctx, input, req);
  return { id: e.id, code: e.code };
});
