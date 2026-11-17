"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { apiFetch, useAction } from "@/lib/client";
import { fmtDate, unaccent } from "@/lib/format";
import { cn } from "@/lib/utils";

type ShiftOpt = { value: string; label: string; color: string; short: string };
const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function AssignForm({ employees, shifts }: { employees: { value: string; label: string; group: string }[]; shifts: ShiftOpt[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [dows, setDows] = useState<number[]>([1, 2, 3, 4, 5]);
  const { run, loading } = useAction();
  const filtered = useMemo(() => {
    const t = unaccent(q).toLowerCase();
    return employees.filter((e) => !t || unaccent(`${e.label} ${e.group}`).toLowerCase().includes(t));
  }, [q, employees]);
  return (
    <form
      className="space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const body = {
          employeeIds: picked,
          shiftId: (f.get("shiftId") as string) || null,
          startDate: f.get("startDate"),
          endDate: (f.get("endDate") as string) || null,
          daysOfWeek: dows,
          note: (f.get("note") as string) || null,
        };
        if ((await run(() => apiFetch("/api/shift-assignments", { body }), `Đã phân ca cho ${picked.length} nhân viên`)) !== undefined) setPicked([]);
      }}
    >
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Nhân viên ({picked.length} đã chọn)</span>
          <div className="flex gap-2 text-xs">
            <button type="button" className="text-primary hover:underline" onClick={() => setPicked(filtered.map((e) => e.value))}>
              Chọn tất cả
            </button>
            <button type="button" className="text-muted-foreground hover:underline" onClick={() => setPicked([])}>
              Bỏ chọn
            </button>
          </div>
        </div>
        <Input placeholder="Lọc theo tên, phòng ban…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
        <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border p-2">
          {filtered.map((e) => (
            <label key={e.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
              <input type="checkbox" checked={picked.includes(e.value)} onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.value] : p.filter((x) => x !== e.value)))} />
              <span className="flex-1">{e.label}</span>
              <span className="text-xs text-muted-foreground">{e.group}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ca làm việc">
          <Select name="shiftId" defaultValue={shifts[0]?.value}>
            {shifts.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
            <option value="">— Ngày nghỉ (không làm) —</option>
          </Select>
        </Field>
        <Field label="Ghi chú">
          <Input name="note" placeholder="VD: Ca xoay tháng 12" />
        </Field>
        <Field label="Từ ngày" required>
          <Input name="startDate" type="date" required />
        </Field>
        <Field label="Đến ngày" hint="Để trống = không thời hạn; trùng ngày bắt đầu = phân ca 1 ngày">
          <Input name="endDate" type="date" />
        </Field>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium">Áp dụng các ngày trong tuần</p>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setDows((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]))}
              className={cn("h-9 w-11 rounded-md border text-sm font-medium", dows.includes(d) ? "border-primary bg-primary text-primary-foreground" : "border-input")}
            >
              {DOW[d]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!picked.length || !dows.length} loading={loading}>
          Phân ca
        </Button>
      </div>
    </form>
  );
}

type Row = { id: string; name: string; code: string; cells: { date: string; shiftId: string | null; label: string; color: string | null; holiday: string | null }[] };

export function WeekGrid({ rows, days, shifts, prevWeek, nextWeek }: { rows: Row[]; days: string[]; shifts: ShiftOpt[]; prevWeek: string; nextWeek: string }) {
  const [sel, setSel] = useState<{ row: Row; date: string; shiftId: string | null } | null>(null);
  const { run, loading } = useAction();
  return (
    <>
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
        <Link href={`?tab=schedule&week=${prevWeek}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Tuần trước
        </Link>
        <span className="font-medium">
          {fmtDate(days[0])} – {fmtDate(days[6])}
        </span>
        <Link href={`?tab=schedule&week=${nextWeek}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          Tuần sau <ChevronRight className="size-4" />
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 text-xs text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Nhân viên</th>
              {days.map((d) => (
                <th key={d} className="px-2 py-2 text-center font-medium">
                  {DOW[new Date(d + "T00:00:00Z").getUTCDay()]} {d.slice(8)}/{d.slice(5, 7)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <span className="font-medium">{r.name}</span> <span className="text-xs text-muted-foreground">{r.code}</span>
                </td>
                {r.cells.map((c) => (
                  <td key={c.date} className="p-1 text-center">
                    <button
                      onClick={() => setSel({ row: r, date: c.date, shiftId: c.shiftId })}
                      className={cn("h-8 w-full rounded-md border text-xs font-semibold", c.shiftId ? "border-transparent text-white" : "border-dashed border-border text-muted-foreground")}
                      style={c.color ? { background: c.color } : undefined}
                      title={c.holiday ? `Ngày lễ: ${c.holiday}` : undefined}
                    >
                      {c.label || "Nghỉ"}
                      {c.holiday && " ★"}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        {shifts.map((s) => (
          <span key={s.value} className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm" style={{ background: s.color }} /> {s.short}: {s.label}
          </span>
        ))}
        <span>★ Ngày lễ</span>
      </div>
      {sel && (
        <Dialog open onClose={() => setSel(null)} title={`Đổi ca ${sel.row.name}`} description={`Ngày ${fmtDate(sel.date)} – áp dụng riêng cho ngày này (ca xoay)`} size="sm">
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const shiftId = (new FormData(e.currentTarget).get("shiftId") as string) || null;
              const ok = await run(() => apiFetch("/api/shift-assignments", { body: { employeeIds: [sel.row.id], shiftId, startDate: sel.date, endDate: sel.date, daysOfWeek: [], note: "Đổi ca theo ngày" } }), "Đã đổi ca");
              if (ok !== undefined) setSel(null);
            }}
          >
            <Select name="shiftId" defaultValue={sel.shiftId ?? ""}>
              {shifts.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
              <option value="">Nghỉ</option>
            </Select>
            <div className="flex justify-end">
              <Button type="submit" loading={loading}>
                Lưu
              </Button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
