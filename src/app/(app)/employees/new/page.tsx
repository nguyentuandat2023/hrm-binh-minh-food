import { requirePagePerm } from "@/lib/auth";
import { orgOptions } from "@/lib/options";
import { PageHeader } from "@/components/ui/misc";
import { EmployeeCreateForm } from "../employee-form";

export const metadata = { title: "Thêm nhân viên" };

export default async function NewEmployeePage() {
  const ctx = await requirePagePerm("employee.create");
  const options = await orgOptions();
  return (
    <div>
      <PageHeader title="Thêm nhân viên" back={{ href: "/employees", label: "Danh sách nhân viên" }} />
      <EmployeeCreateForm options={options} canPrivate={!!ctx.perms["employee_private.update"]} canSalary={!!ctx.perms["salary.update"]} />
    </div>
  );
}
