"use client";
import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/form";
import { apiFetch, useAction } from "@/lib/client";
import { unaccent } from "@/lib/format";

export function AssignMembers({ departmentId, departmentName, employees }: { departmentId: string; departmentName: string; employees: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const { run, loading } = useAction();
  const list = useMemo(() => {
    const t = unaccent(q).toLowerCase();
    return employees.filter((e) => !t || unaccent(e.label).toLowerCase().includes(t)).slice(0, 100);
  }, [q, employees]);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => (setOpen(true), setPicked([]))}>
        <UserPlus /> Phân bổ
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Phân bổ nhân viên vào ${departmentName}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={!picked.length}
              loading={loading}
              onClick={async () => {
                if ((await run(() => apiFetch(`/api/departments/${departmentId}/members`, { body: { employeeIds: picked } }), `Đã chuyển ${picked.length} nhân viên`)) !== undefined) setOpen(false);
              }}
            >
              Chuyển {picked.length || ""} nhân viên
            </Button>
          </>
        }
      >
        <Input placeholder="Tìm nhân viên…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {list.map((e) => (
            <label key={e.value} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
              <input type="checkbox" checked={picked.includes(e.value)} onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.value] : p.filter((x) => x !== e.value)))} />
              {e.label}
            </label>
          ))}
        </div>
      </Dialog>
    </>
  );
}
