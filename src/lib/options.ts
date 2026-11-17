import "server-only";
import { prisma } from "./db";

/** Danh mục dùng cho các ô chọn trong form */
export async function orgOptions() {
  const [departments, positions, branches, employees] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { sortOrder: "asc" } }),
    prisma.position.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: [{ level: "desc" }, { name: "asc" }] }),
    prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({
      where: { deactivatedAt: null, status: { not: "RESIGNED" } },
      select: { id: true, fullName: true, code: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  return {
    departments: departments.map((d) => ({ value: d.id, label: d.name })),
    positions: positions.map((p) => ({ value: p.id, label: p.name })),
    branches: branches.map((b) => ({ value: b.id, label: b.name })),
    employees: employees.map((e) => ({ value: e.id, label: `${e.fullName} (${e.code})` })),
  };
}
export type OrgOptions = Awaited<ReturnType<typeof orgOptions>>;
