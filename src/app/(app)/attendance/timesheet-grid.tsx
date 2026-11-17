"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { DAY_STATUS_META, type DayStatus } from "@/lib/attendance-calc";
import { apiFetch, useAction } from "@/lib/client";
import { fmtDate, fmtMinutes, fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Cell = { date: string; status: DayStatus; value: number; late: number; early: number; ot: number; checkIn: string | null; checkOut: string | null; shift: string | null; note?: string };
type Row = { employee: { id: string; code: string; fullName: string; department: string | null }; cells: Cell[]; totals: Record<string, number> };

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function TimesheetGrid({ rows, canEdit, today, selfId }: { rows: Row[]; canEdit: boolean; today: string; selfId: string | null }) {
  const [sel, setSel] = useState<{ row: Row; cell: Cell } | null>(null);
  const days = rows[0]?.cells.map((c) => c.date) ?? [];
  return (
    <>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-48 border-b border-border bg-card px-3 py-2 text-left font-medium">Nhân viên</th>
              {days.map((d) => {
                const dow = new Date(d + "T00:00:00Z").getUTCDay();
                return (
                  <th key={d} className={cn("w-9 min-w-9 border-b border-border px-0.5 py-1 text-center font-medium", (dow === 0 || dow === 6) && "text-rose-500", d === today && "bg-primary-soft")}>
                    <div>{Number(d.slice(8))}</div>
                    <div className="text-[10px] font-normal text-muted-foreground">{WD[dow]}</div>
                  </th>
                );
              })}
              {["Công", "Phép", "KL", "Lễ", "Muộn", "Vắng", "OT(h)"].map((h) => (
                <th key={h} className="border-b border-l border-border bg-muted/40 px-2 py-2 text-right font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee.id} className="hover:bg-muted/30">
                <td className="sticky left-0 z-10 border-b border-border bg-card px-3 py-1.5">
                  <Link href={`/employees/${r.employee.id}`} className="block truncate font-medium hover:underline">
                    {r.employee.fullName}
                  </Link>
                  <span className="text-[11px] text-muted-foreground">
                    {r.employee.code} · {r.employee.department ?? ""}
                  </span>
                </td>
                {r.cells.map((c) => {
                  const meta = DAY_STATUS_META[c.status];
                  const label = c.status === "FULL" ? "✓" : c.status === "PARTIAL" ? String(c.value) : meta.short;
                  return (
                    <td key={c.date} className="border-b border-border p-0.5 text-center">
                      <button
                        onClick={() => setSel({ row: r, cell: c })}
                        title={`${fmtDate(c.date)}: ${meta.label}${c.checkIn ? ` · vào ${fmtTime(c.checkIn)}` : ""}${c.checkOut ? ` · ra ${fmtTime(c.checkOut)}` : ""}${c.note ? ` · ${c.note}` : ""}`}
                        className={cn("relative h-7 w-8 rounded text-[11px] font-semibold", meta.className, c.status === "OFF" && "text-muted-foreground/40")}
                      >
                        {c.status === "OFF" ? "·" : label}
                        {c.ot > 0 && <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-violet-500" aria-label="Có tăng ca" />}
                        {c.late > 0 && c.status !== "ABSENT" && <span className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-amber-500" aria-label="Đi muộn" />}
                      </button>
                    </td>
                  );
                })}
                <td className="tabular border-b border-l border-border px-2 text-right font-semibold">{r.totals.workdays}</td>
                <td className="tabular border-b border-border px-2 text-right">{r.totals.paidLeave}</td>
                <td className="tabular border-b border-border px-2 text-right">{r.totals.unpaidLeave}</td>
                <td className="tabular border-b border-border px-2 text-right">{r.totals.holidays}</td>
                <td className="tabular border-b border-border px-2 text-right">{r.totals.lateCount}</td>
                <td className="tabular border-b border-border px-2 text-right">{r.totals.absent}</td>
                <td className="tabular border-b border-border px-2 text-right">{(r.totals.otMinutes / 60).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        {(["FULL", "PARTIAL", "MISSING_OUT", "ABSENT", "LEAVE", "HALF_LEAVE", "UNPAID", "HOLIDAY", "WORKING"] as DayStatus[]).map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={cn("inline-flex h-5 min-w-6 items-center justify-center rounded px-1 text-[10px] font-semibold", DAY_STATUS_META[s].className)}>{s === "FULL" ? "✓" : s === "PARTIAL" ? "0.5" : DAY_STATUS_META[s].short}</span>
            {DAY_STATUS_META[s].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500" /> Đi muộn
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-violet-500" /> Làm thêm giờ
        </span>
      </div>
      {sel && <CellDialog sel={sel} canEdit={canEdit && sel.row.employee.id !== selfId} onClose={() => setSel(null)} />}
    </>
  );
}

function CellDialog({ sel, canEdit, onClose }: { sel: { row: Row; cell: Cell }; canEdit: boolean; onClose: () => void }) {
  const { cell, row } = sel;
  const { run, loading, fieldErrors } = useAction();
  const meta = DAY_STATUS_META[cell.status];
  const toHHmm = (iso: string | null) => (iso ? fmtTime(iso) : "");
  const nextDay = !!cell.checkIn && !!cell.checkOut && new Date(cell.checkOut).getTime() - new Date(cell.checkIn).getTime() > 0 && fmtDate(new Date(cell.checkOut)) !== fmtDate(cell.date);
  return (
    <Dialog open onClose={onClose} title={`${row.employee.fullName} · ${fmtDate(cell.date)}`} description={meta.label || "Chưa đến ngày"}>
      <dl className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">Ca làm việc</dt>
        <dd>{cell.shift ?? "Không có ca"}</dd>
        <dt className="text-muted-foreground">Giờ vào / ra</dt>
        <dd className="tabular">
          {toHHmm(cell.checkIn) || "—"} / {toHHmm(cell.checkOut) || "—"}
        </dd>
        <dt className="text-muted-foreground">Công</dt>
        <dd className="tabular">{cell.value}</dd>
        <dt className="text-muted-foreground">Đi muộn / về sớm</dt>
        <dd className="tabular">
          {fmtMinutes(cell.late)} / {fmtMinutes(cell.early)}
        </dd>
        {cell.ot > 0 && (
          <>
            <dt className="text-muted-foreground">Tăng ca đã duyệt</dt>
            <dd className="tabular">{fmtMinutes(cell.ot)}</dd>
          </>
        )}
        {cell.note && (
          <>
            <dt className="text-muted-foreground">Ghi chú</dt>
            <dd>{cell.note}</dd>
          </>
        )}
      </dl>
      {canEdit && (
        <form
          className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const body = {
              employeeId: row.employee.id,
              workDate: cell.date,
              checkIn: (f.get("checkIn") as string) || null,
              checkOut: (f.get("checkOut") as string) || null,
              checkOutNextDay: f.get("next") === "on",
              note: f.get("note"),
            };
            if ((await run(() => apiFetch("/api/attendance/records", { method: "PUT", body }), "Đã cập nhật công")) !== undefined) onClose();
          }}
        >
          <p className="text-sm font-medium sm:col-span-2">Sửa công (ghi nhật ký)</p>
          <Field label="Giờ vào">
            <Input type="time" name="checkIn" defaultValue={toHHmm(cell.checkIn)} />
          </Field>
          <Field label="Giờ ra">
            <Input type="time" name="checkOut" defaultValue={toHHmm(cell.checkOut)} />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox name="next" defaultChecked={nextDay} label="Giờ ra thuộc ngày hôm sau (ca qua đêm)" />
          </div>
          <Field label="Lý do chỉnh sửa" required error={fieldErrors.note} className="sm:col-span-2">
            <Input name="note" required minLength={3} />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={loading}>
              Lưu công
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
