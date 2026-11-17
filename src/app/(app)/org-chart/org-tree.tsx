"use client";
import { useState } from "react";
import Link from "next/link";
import { Building2, ChevronDown, ChevronRight, Crown, Lock } from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; title: string; avatarFileId: string | null; canOpen: boolean };
export type OrgNode = { id: string; name: string; head: Person | null; members: Person[]; children: OrgNode[] };

function countAll(n: OrgNode): number {
  return (n.head ? 1 : 0) + n.members.length + n.children.reduce((s, c) => s + countAll(c), 0);
}

function PersonChip({ p, head }: { p: Person; head?: boolean }) {
  const inner = (
    <span className={cn("flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm", p.canOpen && "hover:border-primary/60 hover:bg-primary-soft/40", head && "border-primary/40")}>
      <Avatar name={p.name} fileId={p.avatarFileId} size={28} />
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-medium">
          {head && <Crown className="size-3.5 text-amber-500" aria-label="Trưởng đơn vị" />}
          <span className="truncate">{p.name}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">{p.title || "—"}</span>
      </span>
      {!p.canOpen && <Lock className="ml-auto size-3 text-muted-foreground/60" aria-label="Không có quyền xem hồ sơ" />}
    </span>
  );
  return p.canOpen ? <Link href={`/employees/${p.id}`}>{inner}</Link> : <span title="Bạn không có quyền xem hồ sơ này">{inner}</span>;
}

function NodeView({ node, depth, expanded, toggle }: { node: OrgNode; depth: number; expanded: Set<string>; toggle: (id: string) => void }) {
  const open = expanded.has(node.id);
  return (
    <li className="relative">
      <div className={cn("rounded-xl border border-border bg-card shadow-sm", depth === 0 && "border-primary/30")}>
        <button onClick={() => toggle(node.id)} className="flex w-full items-center gap-2 px-4 py-3 text-left" aria-expanded={open}>
          {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
          <Building2 className="size-4 shrink-0 text-primary" />
          <span className="flex-1 font-semibold">{node.name}</span>
          <span className="rounded-full bg-muted px-2 text-xs text-muted-foreground tabular">{countAll(node)} người</span>
        </button>
        {open && (node.head || node.members.length > 0) && (
          <div className="space-y-2 border-t border-border px-4 py-3">
            {node.head && (
              <div className="max-w-xs">
                <PersonChip p={node.head} head />
              </div>
            )}
            {node.members.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {node.members.map((m) => (
                  <PersonChip key={m.id} p={m} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {open && node.children.length > 0 && (
        <ul className="ml-4 mt-3 space-y-3 border-l-2 border-dashed border-border pl-4 sm:ml-6 sm:pl-6">
          {node.children.map((c) => (
            <NodeView key={c.id} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function OrgTree({ company, nodes, unassigned, total }: { company: string; nodes: OrgNode[]; unassigned: Person[]; total: number }) {
  const allIds = (ns: OrgNode[]): string[] => ns.flatMap((n) => [n.id, ...allIds(n.children)]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(allIds(nodes)));
  const toggle = (id: string) => setExpanded((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-primary-foreground">
          <Building2 className="size-5" />
          <span className="font-semibold">{company}</span>
          <span className="text-sm opacity-80">· {total} nhân viên</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setExpanded(new Set(allIds(nodes)))}>
            Mở rộng tất cả
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExpanded(new Set())}>
            Thu gọn tất cả
          </Button>
        </div>
      </div>
      <ul className="space-y-3">
        {nodes.map((n) => (
          <NodeView key={n.id} node={n} depth={0} expanded={expanded} toggle={toggle} />
        ))}
      </ul>
      {unassigned.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Chưa phân phòng ban ({unassigned.length})</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {unassigned.map((p) => (
              <PersonChip key={p.id} p={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
