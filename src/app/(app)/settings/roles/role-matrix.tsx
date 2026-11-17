"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiFetch, useAction } from "@/lib/client";
import { cn } from "@/lib/utils";
import { ActionButton } from "@/components/form-dialog";

type Opt = { value: string; label: string };
const SCOPE_SHORT: Record<string, string> = { SELF: "Bản thân", TEAM: "Nhóm", DEPARTMENT: "Phòng", BRANCH: "Chi nhánh", COMPANY: "Công ty" };

export function RoleMatrix({
  roles,
  selectedId,
  modules,
  actions,
  scopes,
  current,
  canEdit,
}: {
  roles: { id: string; key: string; name: string; description: string | null; isSystem: boolean; users: number }[];
  selectedId: string;
  modules: { key: string; name: string; companyOnly: boolean; actions: { action: string; desc: string }[] }[];
  actions: { key: string; label: string }[];
  scopes: Opt[];
  current: Record<string, string>;
  canEdit: boolean;
}) {
  const [m, setM] = useState<Record<string, string>>(current);
  const { run, loading } = useAction();
  const dirty = JSON.stringify(m) !== JSON.stringify(current);
  const role = roles.find((r) => r.id === selectedId)!;
  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <Card className="h-fit p-2">
        {roles.map((r) => (
          <Link key={r.id} href={`?role=${r.id}`} className={cn("block rounded-md px-3 py-2 text-sm hover:bg-muted", r.id === selectedId && "bg-primary-soft font-medium text-primary")}>
            {r.name}
            <span className="block text-xs text-muted-foreground">
              {r.users} tài khoản{r.isSystem ? " · hệ thống" : ""}
            </span>
          </Link>
        ))}
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <p className="font-semibold">{role.name}</p>
            <p className="text-xs text-muted-foreground">{role.key === "SUPER_ADMIN" ? "Toàn quyền – không chỉnh sửa" : role.description}</p>
          </div>
          <div className="flex gap-2">
            {canEdit && !role.isSystem && role.users === 0 && <ActionButton url={`/api/admin/roles/${role.id}`} method="DELETE" label="Xoá vai trò" danger confirmTitle={`Xoá vai trò ${role.name}?`} />}
            {canEdit && (
              <>
                <Button variant="outline" disabled={!dirty} onClick={() => setM(current)}>
                  Hoàn tác
                </Button>
                <Button
                  disabled={!dirty}
                  loading={loading}
                  onClick={() => run(() => apiFetch(`/api/admin/roles/${role.id}`, { method: "PUT", body: { permissions: Object.entries(m).map(([key, scope]) => ({ key, scope })) } }), "Đã lưu ma trận quyền")}
                >
                  Lưu thay đổi
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Module</th>
                {actions.map((a) => (
                  <th key={a.key} className="px-2 py-2 text-center font-medium">
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {modules.map((mod) => (
                <tr key={mod.key}>
                  <td className="px-3 py-2 font-medium">
                    {mod.name}
                    {mod.companyOnly && <Badge tone="slate" className="ml-1">Quản trị</Badge>}
                  </td>
                  {actions.map((a) => {
                    const def = mod.actions.find((x) => x.action === a.key);
                    if (!def) return <td key={a.key} className="px-2 py-2 text-center text-muted-foreground/40">—</td>;
                    const k = `${mod.key}.${a.key}`;
                    const val = m[k] ?? "";
                    return (
                      <td key={a.key} className="px-1 py-1.5 text-center" title={def.desc}>
                        {canEdit ? (
                          <select
                            aria-label={`${mod.name} – ${a.label}`}
                            value={val}
                            onChange={(e) =>
                              setM((s) => {
                                const n = { ...s };
                                if (e.target.value) n[k] = e.target.value;
                                else delete n[k];
                                return n;
                              })
                            }
                            className={cn("h-8 w-full max-w-28 rounded-md border px-1 text-xs", val ? "border-primary/40 bg-primary-soft text-primary" : "border-input bg-card text-muted-foreground")}
                          >
                            <option value="">Không</option>
                            {(mod.companyOnly ? scopes.filter((s) => s.value === "COMPANY") : scopes).map((s) => (
                              <option key={s.value} value={s.value}>
                                {SCOPE_SHORT[s.value]}
                              </option>
                            ))}
                          </select>
                        ) : val ? (
                          <Badge tone="primary">{SCOPE_SHORT[val]}</Badge>
                        ) : (
                          <span className="text-muted-foreground/50">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-xs text-muted-foreground">Rê chuột lên ô để xem mô tả hành động. “Phòng” = phòng ban của người dùng và phòng ban họ làm trưởng (kể cả phòng con).</p>
      </Card>
    </div>
  );
}
