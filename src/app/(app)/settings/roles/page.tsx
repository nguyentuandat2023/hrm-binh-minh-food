import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { ACTIONS, ACTION_LABEL, MODULES, SCOPE_LABEL, type Scope } from "@/lib/permissions";
import { spGet, type SP } from "@/lib/utils";
import { Notice, PageHeader } from "@/components/ui/misc";
import { FormDialog } from "@/components/form-dialog";
import { RoleMatrix } from "./role-matrix";

export const metadata = { title: "Phân quyền" };

export default async function RolesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("admin_role.view");
  const roles = await prisma.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: [{ isSystem: "desc" }, { name: "asc" }] });
  const roleParam = spGet(await searchParams, "role");
  const selected = roles.find((r) => r.id === roleParam) ?? roles.find((r) => r.key === "HR_ADMIN") ?? roles[0];
  const canEdit = can(ctx, "admin_role.update");
  const current: Record<string, Scope> = Object.fromEntries(selected.permissions.map((p) => [p.permission.key, p.scope as Scope]));
  return (
    <div>
      <PageHeader
        back={{ href: "/settings", label: "Cài đặt" }}
        title="Ma trận phân quyền"
        description="Quyền = Module × Hành động × Phạm vi dữ liệu (bản thân, nhóm, phòng ban, chi nhánh, toàn công ty)"
        actions={
          canEdit && (
            <FormDialog
              title="Tạo vai trò mới"
              url="/api/admin/roles"
              trigger="Thêm vai trò"
              icon="plus"
              fields={[
                { name: "key", label: "Mã vai trò", required: true, placeholder: "VD: TRUONG_NHOM" },
                { name: "name", label: "Tên vai trò", required: true },
                { name: "copyFromRoleId", label: "Sao chép quyền từ", type: "select", options: roles.filter((r) => r.key !== "SUPER_ADMIN").map((r) => ({ value: r.id, label: r.name })) },
                { name: "description", label: "Mô tả", type: "textarea" },
              ]}
            />
          )
        }
      />
      <Notice className="mb-4">
        Phân quyền được kiểm tra phía máy chủ ở mọi API. Các module quản trị (tài khoản, phân quyền, cấu hình, nhật ký, sao lưu) luôn ở phạm vi toàn công ty. Thay đổi có hiệu lực ngay ở lần tải trang tiếp theo của người dùng và được ghi nhật ký.
      </Notice>
      <RoleMatrix
        roles={roles.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, isSystem: r.isSystem, users: r._count.users }))}
        selectedId={selected.id}
        modules={MODULES.map((m) => ({ key: m.key, name: m.name, companyOnly: !!m.companyOnly, actions: Object.entries(m.actions).map(([a, d]) => ({ action: a, desc: d! })) }))}
        actions={ACTIONS.map((a) => ({ key: a, label: ACTION_LABEL[a] }))}
        scopes={Object.entries(SCOPE_LABEL).map(([k, v]) => ({ value: k, label: v }))}
        current={current}
        canEdit={canEdit && selected.key !== "SUPER_ADMIN" && (!ctx.roleKeys.includes(selected.key) || ctx.roleKeys.includes("SUPER_ADMIN"))}
      />
    </div>
  );
}
