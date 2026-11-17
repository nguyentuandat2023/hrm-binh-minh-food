import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { orgOptions } from "@/lib/options";
import { spGet, type SP } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton, FormDialog, type FieldDef } from "@/components/form-dialog";
import { AssignMembers } from "./assign-members";

export const metadata = { title: "Phòng ban" };

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("org.view");
  const tab = spGet(await searchParams, "tab") ?? "departments";
  const canCreate = can(ctx, "org.create", "COMPANY");
  const canUpdate = can(ctx, "org.update", "COMPANY");
  const canDelete = can(ctx, "org.delete", "COMPANY");
  const opts = await orgOptions();

  const tabs = [
    { key: "departments", label: "Phòng ban", href: "?tab=departments" },
    { key: "branches", label: "Chi nhánh", href: "?tab=branches" },
    { key: "positions", label: "Chức vụ", href: "?tab=positions" },
  ];

  if (tab === "branches") {
    const branches = await prisma.branch.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { employees: { where: { deactivatedAt: null, status: { not: "RESIGNED" } } } } } } });
    const fields = (b?: (typeof branches)[number]): FieldDef[] => [
      { name: "code", label: "Mã chi nhánh", required: true, defaultValue: b?.code },
      { name: "name", label: "Tên chi nhánh", required: true, defaultValue: b?.name },
      { name: "address", label: "Địa chỉ", full: true, defaultValue: b?.address },
      { name: "phone", label: "Điện thoại", defaultValue: b?.phone },
      { name: "gpsRadiusM", label: "Bán kính chấm công GPS (m)", type: "number", min: 20, max: 5000, defaultValue: b?.gpsRadiusM ?? 200 },
      { name: "latitude", label: "Vĩ độ (GPS)", type: "number", step: 0.000001, defaultValue: b?.latitude, hint: "Chỉ cần khi bật chấm công GPS" },
      { name: "longitude", label: "Kinh độ (GPS)", type: "number", step: 0.000001, defaultValue: b?.longitude },
    ];
    return (
      <div>
        <PageHeader title="Cơ cấu tổ chức" actions={canCreate && <FormDialog title="Thêm chi nhánh" fields={fields()} url="/api/branches" trigger="Thêm chi nhánh" icon="plus" />} />
        <Tabs items={tabs} active={tab} />
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Mã</TH>
                <TH>Chi nhánh</TH>
                <TH className="hidden md:table-cell">Địa chỉ</TH>
                <TH className="text-right">Nhân viên</TH>
                <TH>Trạng thái</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {branches.map((b) => (
                <TR key={b.id}>
                  <TD className="font-mono text-xs">{b.code}</TD>
                  <TD className="font-medium">{b.name}</TD>
                  <TD className="hidden md:table-cell">{b.address}</TD>
                  <TD className="tabular text-right">{b._count.employees}</TD>
                  <TD>{b.isActive ? <Badge tone="green">Hoạt động</Badge> : <Badge tone="slate">Ngừng</Badge>}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      {canUpdate && <FormDialog title="Sửa chi nhánh" fields={fields(b)} url={`/api/branches/${b.id}`} method="PATCH" trigger="Sửa" triggerVariant="ghost" triggerSize="sm" />}
                      {canDelete && (
                        <ActionButton url={`/api/branches/${b.id}`} method="PATCH" body={{ isActive: !b.isActive }} label={b.isActive ? "Ngừng" : "Kích hoạt"} variant="ghost" danger={b.isActive} confirmTitle={b.isActive ? `Ngừng hoạt động chi nhánh ${b.name}?` : `Kích hoạt lại ${b.name}?`} />
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    );
  }

  if (tab === "positions") {
    const positions = await prisma.position.findMany({ orderBy: [{ level: "desc" }, { name: "asc" }], include: { department: { select: { name: true } }, _count: { select: { employees: { where: { deactivatedAt: null, status: { not: "RESIGNED" } } } } } } });
    const fields = (p?: (typeof positions)[number]): FieldDef[] => [
      { name: "code", label: "Mã chức vụ", required: true, defaultValue: p?.code },
      { name: "name", label: "Tên chức vụ", required: true, defaultValue: p?.name },
      { name: "level", label: "Cấp bậc (1–20)", type: "number", min: 1, max: 20, defaultValue: p?.level ?? 1, hint: "Số càng lớn cấp càng cao" },
      { name: "departmentId", label: "Thuộc phòng ban", type: "select", options: opts.departments, emptyOption: "Dùng chung", defaultValue: p?.departmentId },
    ];
    return (
      <div>
        <PageHeader title="Cơ cấu tổ chức" actions={canCreate && <FormDialog title="Thêm chức vụ" fields={fields()} url="/api/positions" trigger="Thêm chức vụ" icon="plus" />} />
        <Tabs items={tabs} active={tab} />
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Mã</TH>
                <TH>Chức vụ</TH>
                <TH>Cấp bậc</TH>
                <TH className="hidden md:table-cell">Phòng ban</TH>
                <TH className="text-right">Nhân viên</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {positions.map((p) => (
                <TR key={p.id} className={p.isActive ? undefined : "opacity-60"}>
                  <TD className="font-mono text-xs">{p.code}</TD>
                  <TD className="font-medium">{p.name}</TD>
                  <TD className="tabular">{p.level}</TD>
                  <TD className="hidden md:table-cell">{p.department?.name ?? "Dùng chung"}</TD>
                  <TD className="tabular text-right">{p._count.employees}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      {canUpdate && <FormDialog title="Sửa chức vụ" fields={fields(p)} url={`/api/positions/${p.id}`} method="PATCH" trigger="Sửa" triggerVariant="ghost" triggerSize="sm" />}
                      {canDelete && <ActionButton url={`/api/positions/${p.id}`} method="PATCH" body={{ isActive: !p.isActive }} label={p.isActive ? "Ngừng" : "Kích hoạt"} variant="ghost" danger={p.isActive} confirmTitle={`${p.isActive ? "Ngừng sử dụng" : "Kích hoạt"} chức vụ ${p.name}?`} />}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    );
  }

  const departments = await prisma.department.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      head: { select: { id: true, fullName: true } },
      parent: { select: { name: true } },
      branch: { select: { name: true } },
      _count: { select: { employees: { where: { deactivatedAt: null, status: { not: "RESIGNED" } } } } },
    },
  });
  const deptFields = (d?: (typeof departments)[number]): FieldDef[] => [
    { name: "code", label: "Mã phòng ban", required: true, defaultValue: d?.code },
    { name: "name", label: "Tên phòng ban", required: true, defaultValue: d?.name },
    { name: "parentId", label: "Phòng ban cấp trên", type: "select", options: opts.departments.filter((o) => o.value !== d?.id), defaultValue: d?.parentId },
    { name: "branchId", label: "Chi nhánh", type: "select", options: opts.branches, defaultValue: d?.branchId },
    { name: "headId", label: "Trưởng phòng", type: "select", options: opts.employees, defaultValue: d?.headId },
    { name: "sortOrder", label: "Thứ tự hiển thị", type: "number", min: 0, max: 999, defaultValue: d?.sortOrder ?? 0 },
    { name: "description", label: "Mô tả / chức năng nhiệm vụ", type: "textarea", defaultValue: d?.description },
  ];

  return (
    <div>
      <PageHeader title="Cơ cấu tổ chức" description="Quản lý phòng ban, trưởng phòng và phân bổ nhân sự" actions={canCreate && <FormDialog title="Thêm phòng ban" fields={deptFields()} url="/api/departments" trigger="Thêm phòng ban" icon="plus" size="lg" />} />
      <Tabs items={tabs} active={tab} />
      <Card>
        {departments.length === 0 ? (
          <EmptyState title="Chưa có phòng ban" />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Phòng ban</TH>
                <TH className="hidden md:table-cell">Cấp trên</TH>
                <TH className="hidden lg:table-cell">Chi nhánh</TH>
                <TH>Trưởng phòng</TH>
                <TH className="text-right">Nhân viên</TH>
                <TH>Trạng thái</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {departments.map((d) => (
                <TR key={d.id} className={d.isActive ? undefined : "opacity-60"}>
                  <TD>
                    <Link href={`/employees?department=${d.id}`} className="font-medium hover:underline">
                      {d.name}
                    </Link>
                    <span className="block font-mono text-xs text-muted-foreground">{d.code}</span>
                  </TD>
                  <TD className="hidden md:table-cell">{d.parent?.name ?? "—"}</TD>
                  <TD className="hidden lg:table-cell">{d.branch?.name ?? "—"}</TD>
                  <TD>{d.head ? <Link className="hover:underline" href={`/employees/${d.head.id}`}>{d.head.fullName}</Link> : <span className="text-muted-foreground">Chưa gán</span>}</TD>
                  <TD className="tabular text-right">{d._count.employees}</TD>
                  <TD>{d.isActive ? <Badge tone="green">Hoạt động</Badge> : <Badge tone="slate">Ngừng</Badge>}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      {can(ctx, "employee.update", "COMPANY") && d.isActive && <AssignMembers departmentId={d.id} departmentName={d.name} employees={opts.employees} />}
                      {canUpdate && <FormDialog title={`Sửa phòng ban ${d.name}`} fields={deptFields(d)} url={`/api/departments/${d.id}`} method="PATCH" trigger="Sửa" triggerVariant="ghost" triggerSize="sm" size="lg" />}
                      {canDelete && (
                        <ActionButton
                          url={`/api/departments/${d.id}`}
                          method="PATCH"
                          body={{ isActive: !d.isActive }}
                          label={d.isActive ? "Ngừng" : "Kích hoạt"}
                          variant="ghost"
                          danger={d.isActive}
                          confirmTitle={d.isActive ? `Ngừng hoạt động phòng ${d.name}?` : `Kích hoạt lại phòng ${d.name}?`}
                          confirmMessage={d.isActive ? "Chỉ thực hiện được khi phòng ban không còn nhân viên và phòng ban con đang hoạt động." : undefined}
                        />
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
