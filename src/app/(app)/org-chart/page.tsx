import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { canAccessEmployee } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/ui/misc";
import { OrgTree, type OrgNode } from "./org-tree";

export const metadata = { title: "Sơ đồ tổ chức" };

export default async function OrgChartPage() {
  const ctx = await requirePagePerm("org.view");
  const [company, departments, employees] = await Promise.all([
    getSetting("company"),
    prisma.department.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    prisma.employee.findMany({
      where: { deactivatedAt: null, status: { not: "RESIGNED" } },
      select: { id: true, fullName: true, code: true, departmentId: true, branchId: true, managerId: true, avatarFileId: true, position: { select: { name: true, level: true } } },
    }),
  ]);
  // Chỉ hiển thị tên, chức vụ (thông tin công khai trong tổ chức); hồ sơ chỉ mở khi có quyền
  const person = (e: (typeof employees)[number]) => ({
    id: e.id,
    name: e.fullName,
    title: e.position?.name ?? "",
    avatarFileId: e.avatarFileId,
    canOpen: canAccessEmployee(ctx, "employee.view", e),
  });
  const build = (parentId: string | null): OrgNode[] =>
    departments
      .filter((d) => d.parentId === parentId)
      .map((d) => {
        const members = employees.filter((e) => e.departmentId === d.id);
        const head = members.find((e) => e.id === d.headId) ?? employees.find((e) => e.id === d.headId);
        return {
          id: d.id,
          name: d.name,
          head: head ? person(head) : null,
          members: members
            .filter((e) => e.id !== d.headId)
            .sort((a, b) => (b.position?.level ?? 0) - (a.position?.level ?? 0) || a.fullName.localeCompare(b.fullName, "vi"))
            .map(person),
          children: build(d.id),
        };
      });
  const tree = build(null);
  const unassigned = employees.filter((e) => !e.departmentId).map(person);
  return (
    <div>
      <PageHeader title="Sơ đồ tổ chức" description="Bấm vào phòng ban để thu gọn/mở rộng; bấm vào nhân viên để xem hồ sơ (nếu có quyền)." />
      <OrgTree company={company.name} nodes={tree} unassigned={unassigned} total={employees.length} />
    </div>
  );
}
