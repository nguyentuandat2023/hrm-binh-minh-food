"use client";
// Dialog biểu mẫu tổng quát: khai báo trường → tự render, kiểm tra dữ liệu (HTML5 + server), gửi API, toast, làm mới trang.
import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { apiFetch, useAction } from "@/lib/client";

export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "time" | "datetime-local" | "email" | "select" | "textarea" | "checkbox" | "month" | "hidden";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
  full?: boolean;
  emptyOption?: string;
  defaultValue?: string | number | boolean | null;
};

export function FormDialog({
  title,
  description,
  fields,
  url,
  method = "POST",
  submitLabel = "Lưu",
  successMessage = "Đã lưu",
  trigger,
  triggerVariant = "default",
  triggerSize = "md",
  icon,
  transform,
  size = "md",
  confirmText,
}: {
  title: string;
  description?: string;
  fields: FieldDef[];
  url: string;
  method?: "POST" | "PATCH" | "PUT";
  submitLabel?: string;
  successMessage?: string;
  trigger: React.ReactNode;
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  icon?: "plus" | "edit" | null;
  transform?: (v: Record<string, unknown>) => Record<string, unknown>;
  size?: "sm" | "md" | "lg" | "xl";
  confirmText?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const { run, loading, fieldErrors } = useAction();
  const confirm = useConfirm();
  const formId = React.useId();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      const el = form.elements.namedItem(f.name) as HTMLInputElement | null;
      if (!el) continue;
      if (f.type === "checkbox") values[f.name] = el.checked;
      else if (f.type === "hidden") values[f.name] = typeof f.defaultValue === "number" ? f.defaultValue : el.value;
      else if (f.type === "number") values[f.name] = el.value === "" ? null : Number(el.value);
      else values[f.name] = el.value.trim() === "" ? null : el.value.trim();
    }
    if (confirmText && !(await confirm({ title, message: confirmText }))) return;
    const body = transform ? transform(values) : values;
    if ((await run(() => apiFetch(url, { method, body }), successMessage)) !== undefined) setOpen(false);
  }

  return (
    <>
      <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
        {icon === "plus" && <Plus />}
        {icon === "edit" && <Pencil />}
        {trigger}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        size={size}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button type="submit" form={formId} loading={loading}>
              {submitLabel}
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => {
            const err = fieldErrors[f.name];
            const dv = f.defaultValue === null || f.defaultValue === undefined ? undefined : f.defaultValue;
            if (f.type === "hidden") return <input key={f.name} type="hidden" name={f.name} value={dv === undefined ? "" : String(dv)} />;
            if (f.type === "checkbox") {
              return (
                <div key={f.name} className="sm:col-span-2">
                  <Checkbox name={f.name} label={f.label} defaultChecked={!!dv} />
                  {f.hint && <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>}
                </div>
              );
            }
            return (
              <Field key={f.name} label={f.label} required={f.required} error={err} hint={f.hint} className={f.full || f.type === "textarea" ? "sm:col-span-2" : undefined}>
                {f.type === "select" ? (
                  <Select name={f.name} defaultValue={dv === undefined ? "" : String(dv)} required={f.required}>
                    {(f.emptyOption !== undefined || !f.required) && <option value="">{f.emptyOption ?? "— Không —"}</option>}
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                ) : f.type === "textarea" ? (
                  <Textarea name={f.name} defaultValue={dv === undefined ? undefined : String(dv)} required={f.required} placeholder={f.placeholder} />
                ) : (
                  <Input
                    name={f.name}
                    type={f.type ?? "text"}
                    defaultValue={dv === undefined ? undefined : String(dv)}
                    required={f.required}
                    placeholder={f.placeholder}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                  />
                )}
              </Field>
            );
          })}
        </form>
      </Dialog>
    </>
  );
}

/** Nút thực hiện 1 thao tác API có xác nhận (duyệt, khoá, ngừng hoạt động…) */
export function ActionButton({
  url,
  method = "POST",
  body,
  label,
  confirmTitle,
  confirmMessage,
  danger,
  successMessage = "Đã thực hiện",
  variant = "outline",
  size = "sm",
  requireText,
  icon,
}: {
  url: string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  label: React.ReactNode;
  confirmTitle?: string;
  confirmMessage?: React.ReactNode;
  danger?: boolean;
  successMessage?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  requireText?: string;
  icon?: React.ReactNode;
}) {
  const confirm = useConfirm();
  const { run, loading } = useAction();
  return (
    <Button
      variant={variant}
      size={size}
      loading={loading}
      className={danger && variant !== "destructive" ? "text-rose-600" : undefined}
      onClick={async () => {
        if (confirmTitle && !(await confirm({ title: confirmTitle, message: confirmMessage, danger, requireText }))) return;
        await run(() => apiFetch(url, { method, body: body ?? (method === "DELETE" ? undefined : {}) }), successMessage);
      }}
    >
      {icon}
      {label}
    </Button>
  );
}
