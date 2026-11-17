"use client";
import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { apiFetch, useAction } from "@/lib/client";
import { unaccent } from "@/lib/format";

type Opt = { value: string; label: string };

export function AssignKpiDialog({ definitions, employees, departments, defaultPeriod }: { definitions: (Opt & { unit: string })[]; employees: (Opt & { group: string })[]; departments: Opt[]; defaultPeriod: string }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"emp" | "dept">("emp");
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [v, setV] = useState({ definitionId: definitions[0]?.value ?? "", period: defaultPeriod, target: "", weight: "1", departmentId: "" });
  const { run, loading, fieldErrors } = useAction();
  const list = useMemo(() => {
    const t = unaccent(q).toLowerCase();
    return employees.filter((e) => !t || unaccent(`${e.label} ${e.group}`).toLowerCase().includes(t));
  }, [q, employees]);
  const unit = definitions.find((d) => d.value === v.definitionId)?.unit;
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Target /> Giao KPI
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Giao KPI"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button
              loading={loading}
              disabled={!v.definitionId || !v.target || (mode === "emp" ? !picked.length : !v.departmentId)}
              onClick={async () => {
                const body = { definitionId: v.definitionId, period: v.period, target: Number(v.target), weight: Number(v.weight), employeeIds: mode === "emp" ? picked : [], departmentId: mode === "dept" ? v.departmentId : null };
                if ((await run(() => apiFetch("/api/kpi/assignments", { body }), "Đã giao KPI")) !== undefined) (setOpen(false), setPicked([]));
              }}
            >
              Giao KPI
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Chỉ tiêu KPI" required className="sm:col-span-2">
            <Select value={v.definitionId} onChange={(e) => setV((s) => ({ ...s, definitionId: e.target.value }))}>
              {definitions.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kỳ (YYYY-MM hoặc YYYY-Q4)" required error={fieldErrors.period}>
            <Input value={v.period} onChange={(e) => setV((s) => ({ ...s, period: e.target.value }))} />
          </Field>
          <Field label={`Mục tiêu${unit ? ` (${unit})` : ""}`} required error={fieldErrors.target}>
            <Input type="number" step="any" value={v.target} onChange={(e) => setV((s) => ({ ...s, target: e.target.value }))} />
          </Field>
          <Field label="Trọng số" hint="Dùng tính điểm tổng hợp có trọng số">
            <Input type="number" step="0.05" min="0.01" value={v.weight} onChange={(e) => setV((s) => ({ ...s, weight: e.target.value }))} />
          </Field>
          <Field label="Giao cho">
            <Select value={mode} onChange={(e) => setMode(e.target.value as "emp" | "dept")}>
              <option value="emp">Nhân viên</option>
              <option value="dept">Phòng ban (KPI tập thể)</option>
            </Select>
          </Field>
          {mode === "dept" ? (
            <Field label="Phòng ban" className="sm:col-span-2">
              <Select value={v.departmentId} onChange={(e) => setV((s) => ({ ...s, departmentId: e.target.value }))}>
                <option value="">— Chọn —</option>
                {departments.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div className="sm:col-span-2">
              <Input placeholder="Lọc nhân viên…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
              <div className="max-h-52 overflow-y-auto rounded-md border border-border p-2">
                {list.map((e) => (
                  <label key={e.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                    <input type="checkbox" checked={picked.includes(e.value)} onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.value] : p.filter((x) => x !== e.value)))} />
                    <span className="flex-1">{e.label}</span>
                    <span className="text-xs text-muted-foreground">{e.group}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Đã chọn {picked.length} nhân viên</p>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
