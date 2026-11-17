"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/dialog";
import { apiFetch, ApiError, formToObject, useAction } from "@/lib/client";
import { EMPLOYEE_STATUS, EMPLOYMENT_TYPE, GENDER } from "@/lib/labels";

type Opt = { value: string; label: string };
interface Props {
  options: { departments: Opt[]; positions: Opt[]; branches: Opt[]; employees: Opt[] };
  canPrivate: boolean;
  canSalary: boolean;
}

export function EmployeeCreateForm({ options, canPrivate, canSalary }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const { run, loading, fieldErrors } = useAction();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = formToObject(e.currentTarget);
    const body: Record<string, unknown> = { ...raw, baseSalary: raw.baseSalary ? Number(raw.baseSalary) : null };
    const create = async (confirmDuplicate: boolean) => apiFetch<{ id: string; code: string }>("/api/employees", { body: { ...body, confirmDuplicate } });
    let r: { id: string; code: string } | undefined;
    try {
      r = await create(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "POSSIBLE_DUPLICATE") {
        if (!(await confirm({ title: "Có thể trùng hồ sơ", message: err.message, confirmText: "Vẫn tạo hồ sơ mới" }))) return;
        r = await run(() => create(true), "Đã thêm nhân viên", { refresh: false });
      } else {
        r = await run(() => Promise.reject(err));
      }
    }
    if (r) {
      router.push(`/employees/${r.id}`);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Card>
        <CardHeader title="Thông tin công việc" description="Mã nhân viên được hệ thống tự sinh." />
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Họ và tên" required error={fieldErrors.fullName}>
            <Input name="fullName" required maxLength={120} />
          </Field>
          <Field label="Email công việc" error={fieldErrors.email}>
            <Input name="email" type="email" />
          </Field>
          <Field label="Điện thoại" error={fieldErrors.phone}>
            <Input name="phone" inputMode="tel" />
          </Field>
          <Field label="Phòng ban">
            <Select name="departmentId" defaultValue="">
              <option value="">— Chọn —</option>
              {options.departments.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Chức vụ">
            <Select name="positionId" defaultValue="">
              <option value="">— Chọn —</option>
              {options.positions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Chi nhánh">
            <Select name="branchId" defaultValue="">
              <option value="">— Chọn —</option>
              {options.branches.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quản lý trực tiếp">
            <Select name="managerId" defaultValue="">
              <option value="">— Không —</option>
              {options.employees.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ngày bắt đầu làm việc" required error={fieldErrors.startDate}>
            <Input name="startDate" type="date" required />
          </Field>
          <Field label="Loại hình làm việc">
            <Select name="employmentType" defaultValue="FULL_TIME">
              {Object.entries(EMPLOYMENT_TYPE).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Trạng thái">
            <Select name="status" defaultValue="PROBATION">
              {Object.entries(EMPLOYEE_STATUS)
                .filter(([v]) => v !== "RESIGNED")
                .map(([v, s]) => (
                  <option key={v} value={v}>
                    {s.label}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Ngày kết thúc thử việc" error={fieldErrors.probationEndDate}>
            <Input name="probationEndDate" type="date" />
          </Field>
          {canSalary && (
            <Field label="Lương cơ bản (VND)" hint="Có thể cập nhật chi tiết sau ở tab Lương">
              <Input name="baseSalary" type="number" min={0} step={100000} />
            </Field>
          )}
        </CardContent>
      </Card>
      {canPrivate && (
        <Card>
          <CardHeader title="Thông tin cá nhân" description="Dữ liệu nhạy cảm – chỉ người có quyền mới xem được. CCCD được mã hoá khi lưu." />
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Ngày sinh" error={fieldErrors.dateOfBirth}>
              <Input name="dateOfBirth" type="date" />
            </Field>
            <Field label="Giới tính" hint="Chỉ thu thập khi cần cho nghiệp vụ (BHXH, báo cáo lao động)">
              <Select name="gender" defaultValue="UNDISCLOSED">
                {Object.entries(GENDER).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Số CCCD" error={fieldErrors.nationalId}>
              <Input name="nationalId" inputMode="numeric" maxLength={12} />
            </Field>
            <Field label="Địa chỉ" className="sm:col-span-2 lg:col-span-3">
              <Input name="address" maxLength={300} />
            </Field>
            <Field label="Người liên hệ khẩn cấp">
              <Input name="emergencyName" />
            </Field>
            <Field label="SĐT liên hệ khẩn cấp" error={fieldErrors.emergencyPhone}>
              <Input name="emergencyPhone" inputMode="tel" />
            </Field>
            <Field label="Quan hệ">
              <Input name="emergencyRelation" placeholder="Vợ/chồng, bố/mẹ…" />
            </Field>
          </CardContent>
        </Card>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Huỷ
        </Button>
        <Button type="submit" loading={loading}>
          Lưu hồ sơ
        </Button>
      </div>
    </form>
  );
}
