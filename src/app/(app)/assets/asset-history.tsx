"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format";

type Row = { id: string; employee: string; assignedAt: string; returnedAt: string | null; conditionOut: string | null; conditionIn: string | null };

export function AssetHistory({ code, name, rows }: { code: string; name: string; rows: Row[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Lịch sử
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Lịch sử bàn giao ${code}`} description={name} size="lg">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa bàn giao lần nào</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1">Nhân viên</th>
                <th>Nhận</th>
                <th>Trả</th>
                <th>Tình trạng</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-2">{r.employee}</td>
                  <td>{fmtDate(new Date(r.assignedAt))}</td>
                  <td>{r.returnedAt ? fmtDate(new Date(r.returnedAt)) : "Đang giữ"}</td>
                  <td className="text-xs">
                    {r.conditionOut ?? "—"} → {r.conditionIn ?? "…"}
                  </td>
                  <td className="text-right">
                    <Link href={`/assets/handover/${r.id}`} target="_blank" className="text-xs text-primary hover:underline">
                      In biên bản
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Dialog>
    </>
  );
}
