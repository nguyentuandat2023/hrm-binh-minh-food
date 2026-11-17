"use client";
import { useRef, useState } from "react";
import { Camera, Download, Eye, EyeOff, FilePlus2, Pencil, Plus, RefreshCw, Trash2, Upload, UserX, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { apiFetch, formToObject, useAction } from "@/lib/client";
import { CONTRACT_TYPE, DOC_CATEGORY, EMPLOYEE_STATUS, EMPLOYMENT_TYPE, GENDER, PAY_TYPE } from "@/lib/labels";
import { fmtVND } from "@/lib/format";

type Opt = { value: string; label: string };
const opts = (o: Record<string, string | { label: string }>) => Object.entries(o).map(([v, l]) => ({ value: v, label: typeof l === "string" ? l : l.label }));

function SelectField({ name, label, options, defaultValue, empty, error }: { name: string; label: string; options: Opt[]; defaultValue?: string | null; empty?: string; error?: string }) {
  return (
    <Field label={label} error={error}>
      <Select name={name} defaultValue={defaultValue ?? ""}>
        {empty !== undefined && <option value="">{empty}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

// ---------------- Sửa thông tin công việc ----------------
export function EditWorkButton({ id, work, options }: { id: string; work: Record<string, unknown> & { department: { id: string } | null; position: { id: string } | null; branch: { id: string } | null; manager: { id: string } | null }; options: { departments: Opt[]; positions: Opt[]; branches: Opt[]; employees: Opt[] } }) {
  const [open, setOpen] = useState(false);
  const { run, loading, fieldErrors } = useAction();
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil /> Sửa thông tin công việc
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Sửa thông tin công việc" size="lg">
        <form
          id="work-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = formToObject(e.currentTarget);
            if ((await run(() => apiFetch(`/api/employees/${id}`, { method: "PATCH", body }), "Đã cập nhật hồ sơ")) !== undefined) setOpen(false);
          }}
        >
          <Field label="Họ và tên" required error={fieldErrors.fullName}>
            <Input name="fullName" defaultValue={String(work.fullName ?? "")} required />
          </Field>
          <Field label="Email" error={fieldErrors.email}>
            <Input name="email" type="email" defaultValue={String(work.email ?? "")} />
          </Field>
          <Field label="Điện thoại" error={fieldErrors.phone}>
            <Input name="phone" defaultValue={String(work.phone ?? "")} />
          </Field>
          <SelectField name="departmentId" label="Phòng ban" options={options.departments} defaultValue={work.department?.id} empty="— Không —" />
          <SelectField name="positionId" label="Chức vụ" options={options.positions} defaultValue={work.position?.id} empty="— Không —" />
          <SelectField name="branchId" label="Chi nhánh" options={options.branches} defaultValue={work.branch?.id} empty="— Không —" />
          <SelectField name="managerId" label="Quản lý trực tiếp" options={options.employees.filter((o) => o.value !== id)} defaultValue={work.manager?.id} empty="— Không —" error={fieldErrors.managerId} />
          <Field label="Ngày bắt đầu" required error={fieldErrors.startDate}>
            <Input name="startDate" type="date" defaultValue={String(work.startDate ?? "")} required />
          </Field>
          <SelectField name="employmentType" label="Loại hình" options={opts(EMPLOYMENT_TYPE)} defaultValue={String(work.employmentType)} />
          <SelectField name="status" label="Trạng thái" options={opts(EMPLOYEE_STATUS)} defaultValue={String(work.status)} />
          <Field label="Hết thử việc">
            <Input name="probationEndDate" type="date" defaultValue={String(work.probationEndDate ?? "")} />
          </Field>
          <Field label="Ngày nghỉ việc" hint="Điền khi trạng thái là Đã nghỉ việc">
            <Input name="endDate" type="date" defaultValue={String(work.endDate ?? "")} />
          </Field>
        </form>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button type="submit" form="work-form" loading={loading}>
            Lưu
          </Button>
        </div>
      </Dialog>
    </>
  );
}

// ---------------- Sửa thông tin cá nhân ----------------
export function EditPrivateButton({ id, data, label = "Sửa thông tin cá nhân", limited = false }: { id: string; data: Record<string, string | null> | null; label?: string; limited?: boolean }) {
  const [open, setOpen] = useState(false);
  const { run, loading, fieldErrors } = useAction();
  const d = data ?? {};
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil /> {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={label} size="lg">
        <form
          id="private-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = formToObject(e.currentTarget);
            const url = limited ? "/api/me/profile" : `/api/employees/${id}`;
            if ((await run(() => apiFetch(url, { method: "PATCH", body }), "Đã cập nhật thông tin")) !== undefined) setOpen(false);
          }}
        >
          {limited && (
            <Field label="Điện thoại" error={fieldErrors.phone}>
              <Input name="phone" defaultValue={d.phone ?? ""} />
            </Field>
          )}
          {!limited && (
            <>
              <Field label="Ngày sinh" error={fieldErrors.dateOfBirth}>
                <Input name="dateOfBirth" type="date" defaultValue={d.dateOfBirth ?? ""} />
              </Field>
              <SelectField name="gender" label="Giới tính" options={opts(GENDER)} defaultValue={d.gender ?? "UNDISCLOSED"} />
              <Field label="Số CCCD" error={fieldErrors.nationalId}>
                <Input name="nationalId" defaultValue={d.nationalId ?? ""} inputMode="numeric" />
              </Field>
            </>
          )}
          <Field label="Địa chỉ" className="sm:col-span-2" error={fieldErrors.address}>
            <Input name="address" defaultValue={d.address ?? ""} />
          </Field>
          <Field label="Người liên hệ khẩn cấp">
            <Input name="emergencyName" defaultValue={d.emergencyName ?? ""} />
          </Field>
          <Field label="SĐT khẩn cấp" error={fieldErrors.emergencyPhone}>
            <Input name="emergencyPhone" defaultValue={d.emergencyPhone ?? ""} />
          </Field>
          <Field label="Quan hệ">
            <Input name="emergencyRelation" defaultValue={d.emergencyRelation ?? ""} />
          </Field>
        </form>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button type="submit" form="private-form" loading={loading}>
            Lưu
          </Button>
        </div>
      </Dialog>
    </>
  );
}

// ---------------- Ngừng kích hoạt ----------------
export function StatusButton({ id, active, name }: { id: string; active: boolean; name: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, loading } = useAction();
  return (
    <>
      <Button variant={active ? "outline" : "secondary"} size="sm" onClick={() => setOpen(true)} className={active ? "text-rose-600" : ""}>
        {active ? <UserX /> : <UserCheck />} {active ? "Ngừng kích hoạt" : "Kích hoạt lại"}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={active ? `Ngừng kích hoạt hồ sơ ${name}?` : `Kích hoạt lại hồ sơ ${name}?`}
        description={active ? "Hồ sơ được giữ nguyên để tra cứu, tài khoản đăng nhập sẽ bị khoá và mọi phiên bị thu hồi." : undefined}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button
              variant={active ? "destructive" : "default"}
              disabled={reason.trim().length < 3}
              loading={loading}
              onClick={async () => {
                if ((await run(() => apiFetch(`/api/employees/${id}/status`, { body: { active: !active, reason } }), "Đã cập nhật trạng thái hồ sơ")) !== undefined) setOpen(false);
              }}
            >
              Xác nhận
            </Button>
          </>
        }
      >
        <Field label="Lý do" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Dialog>
    </>
  );
}

// ---------------- Ảnh đại diện ----------------
export function AvatarUpload({ id }: { id: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const { run, loading } = useAction();
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const form = new FormData();
          form.set("file", f);
          form.set("category", "AVATAR");
          await run(() => apiFetch(`/api/employees/${id}/documents`, { form }), "Đã cập nhật ảnh đại diện");
          e.target.value = "";
        }}
      />
      <Button variant="ghost" size="sm" loading={loading} onClick={() => ref.current?.click()}>
        <Camera /> Đổi ảnh
      </Button>
    </>
  );
}

// ---------------- Hợp đồng ----------------
export function ContractDialogButton({ employeeId, previous, canSalary }: { employeeId: string; previous?: { id: string; type: string; endDate: string | null; baseSalary: number | null }; canSalary: boolean }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(previous?.type === "PROBATION" ? "FIXED_TERM" : (previous?.type ?? "FIXED_TERM"));
  const { run, loading, fieldErrors } = useAction();
  const start = previous?.endDate ? new Date(new Date(previous.endDate + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10) : "";
  return (
    <>
      <Button variant={previous ? "ghost" : "default"} size="sm" onClick={() => setOpen(true)}>
        {previous ? <RefreshCw /> : <FilePlus2 />} {previous ? "Gia hạn" : "Thêm hợp đồng"}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={previous ? "Gia hạn / ký tiếp hợp đồng" : "Thêm hợp đồng"} size="lg">
        <form
          id={`contract-form-${previous?.id ?? "new"}`}
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const raw = formToObject(e.currentTarget);
            const body = { ...raw, baseSalary: raw.baseSalary ? Number(raw.baseSalary) : null, previousId: previous?.id ?? null };
            if ((await run(() => apiFetch(`/api/employees/${employeeId}/contracts`, { body }), "Đã lưu hợp đồng")) !== undefined) setOpen(false);
          }}
        >
          <Field label="Loại hợp đồng" required>
            <Select name="type" value={type} onChange={(e) => setType(e.target.value)}>
              {opts(CONTRACT_TYPE).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Số hợp đồng" hint="Để trống để hệ thống tự sinh">
            <Input name="code" />
          </Field>
          <Field label="Ngày ký">
            <Input name="signedDate" type="date" />
          </Field>
          <Field label="Ngày bắt đầu" required error={fieldErrors.startDate}>
            <Input name="startDate" type="date" defaultValue={start} required />
          </Field>
          {type !== "INDEFINITE" && (
            <Field label="Ngày hết hạn" required>
              <Input name="endDate" type="date" required />
            </Field>
          )}
          {canSalary && (
            <Field label="Mức lương trong HĐ (VND)">
              <Input name="baseSalary" type="number" min={0} step={100000} defaultValue={previous?.baseSalary ?? ""} />
            </Field>
          )}
          <Field label="Ghi chú" className="sm:col-span-2">
            <Textarea name="note" />
          </Field>
          <p className="text-xs text-muted-foreground sm:col-span-2">Bản scan hợp đồng: tải lên ở tab “Tài liệu” với loại “Hợp đồng”.</p>
        </form>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button type="submit" form={`contract-form-${previous?.id ?? "new"}`} loading={loading}>
            Lưu hợp đồng
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export function ContractStatusButton({ id, code }: { id: string; code: string }) {
  const confirm = useConfirm();
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="text-rose-600"
      loading={loading}
      onClick={async () => {
        if (await confirm({ title: `Chấm dứt hợp đồng ${code}?`, message: "Trạng thái hợp đồng sẽ chuyển thành “Đã chấm dứt”. Thao tác được ghi nhật ký.", danger: true, confirmText: "Chấm dứt" })) {
          await run(() => apiFetch(`/api/contracts/${id}`, { method: "PATCH", body: { status: "TERMINATED" } }), "Đã cập nhật hợp đồng");
        }
      }}
    >
      Chấm dứt
    </Button>
  );
}

// ---------------- Lương ----------------
export function SalaryEditButton({ employeeId, profile }: { employeeId: string; profile: { payType: string; baseSalary: number; insuranceSalary: number | null; dependents: number; bankName: string | null; bankAccount: string | null; bankAccountName: string | null } | null }) {
  const [open, setOpen] = useState(false);
  const [base, setBase] = useState(profile?.baseSalary ?? 0);
  const { run, loading, fieldErrors } = useAction();
  const changed = !!profile && base !== profile.baseSalary;
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Pencil /> {profile ? "Cập nhật lương" : "Thiết lập lương"}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Thông tin lương & tài khoản nhận lương" size="lg">
        <form
          id="salary-form"
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = formToObject(e.currentTarget);
            const body = {
              payType: r.payType,
              baseSalary: Number(r.baseSalary ?? 0),
              insuranceSalary: r.insuranceSalary ? Number(r.insuranceSalary) : null,
              dependents: Number(r.dependents ?? 0),
              bankName: r.bankName,
              bankAccount: r.bankAccount,
              bankAccountName: r.bankAccountName,
              effectiveDate: r.effectiveDate ?? undefined,
              reason: r.reason ?? undefined,
            };
            if ((await run(() => apiFetch(`/api/employees/${employeeId}/salary`, { method: "PUT", body }), "Đã lưu thông tin lương")) !== undefined) setOpen(false);
          }}
        >
          <SelectField name="payType" label="Hình thức trả lương" options={opts(PAY_TYPE)} defaultValue={profile?.payType ?? "MONTHLY"} />
          <Field label="Mức lương cơ bản (VND)" required hint="Theo tháng / ngày / giờ tuỳ hình thức" error={fieldErrors.baseSalary}>
            <Input name="baseSalary" type="number" min={0} step={1000} value={base} onChange={(e) => setBase(Number(e.target.value))} required />
          </Field>
          {changed && (
            <>
              <Field label="Ngày hiệu lực điều chỉnh" required>
                <Input name="effectiveDate" type="date" required />
              </Field>
              <Field label="Lý do điều chỉnh" required>
                <Input name="reason" required minLength={3} />
              </Field>
            </>
          )}
          <Field label="Lương đóng BHXH (VND)" hint="Để trống = theo lương cơ bản">
            <Input name="insuranceSalary" type="number" min={0} step={1000} defaultValue={profile?.insuranceSalary ?? ""} />
          </Field>
          <Field label="Số người phụ thuộc (giảm trừ gia cảnh)">
            <Input name="dependents" type="number" min={0} max={20} defaultValue={profile?.dependents ?? 0} />
          </Field>
          <Field label="Ngân hàng">
            <Input name="bankName" defaultValue={profile?.bankName ?? ""} />
          </Field>
          <Field label="Số tài khoản" error={fieldErrors.bankAccount} hint="Được mã hoá khi lưu">
            <Input name="bankAccount" inputMode="numeric" defaultValue={profile?.bankAccount ?? ""} />
          </Field>
          <Field label="Chủ tài khoản">
            <Input name="bankAccountName" defaultValue={profile?.bankAccountName ?? ""} />
          </Field>
        </form>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Huỷ
          </Button>
          <Button type="submit" form="salary-form" loading={loading}>
            Lưu
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export function AllowanceAdd({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = useState(false);
  const { run, loading } = useAction();
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus /> Thêm phụ cấp
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Thêm phụ cấp cố định hằng tháng" size="sm">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = formToObject(e.currentTarget);
            const body = { name: r.name, amount: Number(r.amount ?? 0), taxable: e.currentTarget.taxable.checked };
            if ((await run(() => apiFetch(`/api/employees/${employeeId}/allowances`, { body }), "Đã thêm phụ cấp")) !== undefined) setOpen(false);
          }}
        >
          <Field label="Tên phụ cấp" required>
            <Input name="name" required placeholder="Ăn trưa, xăng xe, điện thoại…" />
          </Field>
          <Field label="Số tiền / tháng (VND)" required>
            <Input name="amount" type="number" min={0} step={1000} required />
          </Field>
          <Checkbox name="taxable" defaultChecked label="Tính vào thu nhập chịu thuế TNCN" />
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>
              Thêm
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function AllowanceDelete({ employeeId, allowanceId, name }: { employeeId: string; allowanceId: string; name: string }) {
  const confirm = useConfirm();
  const { run, loading } = useAction();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Xoá phụ cấp ${name}`}
      loading={loading}
      onClick={async () => {
        if (await confirm({ title: `Xoá phụ cấp "${name}"?`, danger: true, confirmText: "Xoá" })) {
          await run(() => apiFetch(`/api/employees/${employeeId}/allowances?allowanceId=${allowanceId}`, { method: "DELETE" }), "Đã xoá phụ cấp");
        }
      }}
    >
      <Trash2 className="text-rose-600" />
    </Button>
  );
}

export function RevealText({ masked, full }: { masked: string; full: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular">{show ? full : masked}</span>
      <button type="button" onClick={() => setShow((s) => !s)} className="text-muted-foreground hover:text-foreground" aria-label={show ? "Ẩn" : "Hiện"}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </span>
  );
}

export function Money({ value }: { value: number }) {
  return <span className="tabular">{fmtVND(value)}</span>;
}

// ---------------- Tài liệu ----------------
export function DocumentUpload({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = useState(false);
  const { run, loading } = useAction();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Upload /> Tải lên tài liệu
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Tải lên tài liệu" description="PDF, JPG, PNG, WEBP, DOC, DOCX, XLSX – tối đa 10MB" size="sm">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            if ((await run(() => apiFetch(`/api/employees/${employeeId}/documents`, { form }), "Đã tải lên tài liệu")) !== undefined) setOpen(false);
          }}
        >
          <Field label="Loại tài liệu">
            <Select name="category" defaultValue="OTHER">
              {opts(DOC_CATEGORY)
                .filter((o) => o.value !== "AVATAR")
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </Select>
          </Field>
          <input type="file" name="file" required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2" />
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>
              Tải lên
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function DocumentActions({ id, name, canDelete }: { id: string; name: string; canDelete: boolean }) {
  const confirm = useConfirm();
  const { run, loading } = useAction();
  return (
    <div className="flex items-center justify-end gap-1">
      <a href={`/api/files/${id}`} className="rounded-md p-2 hover:bg-muted" aria-label={`Tải ${name}`}>
        <Download className="size-4" />
      </a>
      {canDelete && (
        <Button
          variant="ghost"
          size="icon"
          loading={loading}
          aria-label={`Xoá ${name}`}
          onClick={async () => {
            if (await confirm({ title: `Xoá tài liệu "${name}"?`, message: "Tài liệu bị ẩn khỏi hồ sơ (vẫn lưu vết trong nhật ký).", danger: true, confirmText: "Xoá" })) {
              await run(() => apiFetch(`/api/files/${id}`, { method: "DELETE" }), "Đã xoá tài liệu");
            }
          }}
        >
          <Trash2 className="text-rose-600" />
        </Button>
      )}
    </div>
  );
}
