"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { apiFetch, useAction } from "@/lib/client";
import { cn } from "@/lib/utils";

export type SettingField = {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "textarea" | "time" | "weekdays";
  hint?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  full?: boolean;
};

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function SettingsForm({ settingKey, fields, initial, readOnly }: { settingKey: string; fields: SettingField[]; initial: Record<string, unknown>; readOnly?: boolean }) {
  const [v, setV] = useState<Record<string, unknown>>(initial);
  const { run, loading, fieldErrors } = useAction();
  const set = (k: string, val: unknown) => setV((s) => ({ ...s, [k]: val }));
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = Object.fromEntries(fields.map((f) => [f.key, v[f.key]]));
        await run(() => apiFetch(`/api/admin/settings/${settingKey}`, { method: "PUT", body }), "Đã lưu cấu hình");
      }}
    >
      {fields.map((f) => {
        const val = v[f.key];
        if (f.type === "boolean") {
          return (
            <div key={f.key} className="sm:col-span-2">
              <Checkbox checked={!!val} disabled={readOnly} onChange={(e) => set(f.key, e.target.checked)} label={f.label} />
              {f.hint && <p className="ml-6 text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          );
        }
        return (
          <Field key={f.key} label={f.label} hint={f.hint} error={fieldErrors[f.key]} className={f.full || f.type === "textarea" || f.type === "weekdays" ? "sm:col-span-2" : undefined}>
            {f.type === "select" ? (
              <Select value={String(val ?? "")} disabled={readOnly} onChange={(e) => set(f.key, typeof initial[f.key] === "number" ? Number(e.target.value) : e.target.value || null)}>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : f.type === "textarea" ? (
              <Textarea value={String(val ?? "")} disabled={readOnly} onChange={(e) => set(f.key, e.target.value)} className="min-h-28" />
            ) : f.type === "weekdays" ? (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const arr = (val as number[]) ?? [];
                  const on = arr.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={readOnly}
                      onClick={() => set(f.key, on ? arr.filter((x) => x !== d) : [...arr, d].sort())}
                      className={cn("h-9 w-11 rounded-md border text-sm font-medium", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}
                    >
                      {DOW[d]}
                    </button>
                  );
                })}
              </div>
            ) : (
              <Input
                type={f.type}
                value={val === null || val === undefined ? "" : String(val)}
                min={f.min}
                max={f.max}
                step={f.step}
                disabled={readOnly}
                onChange={(e) => set(f.key, f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
              />
            )}
          </Field>
        );
      })}
      {!readOnly && (
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={loading}>
            Lưu cấu hình
          </Button>
        </div>
      )}
    </form>
  );
}
