import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn, qs } from "@/lib/utils";
import { initials } from "@/lib/format";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function EmptyState({ title = "Chưa có dữ liệu", description, action, icon }: { title?: string; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-6">{icon ?? <Inbox />}</div>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, back }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" />
            {back.label}
          </Link>
        )}
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Avatar({ name, fileId, size = 36, className }: { name: string; fileId?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.36) };
  if (fileId) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/files/${fileId}?inline=1`} alt={name} style={style} className={cn("shrink-0 rounded-full object-cover", className)} />;
  }
  return (
    <span style={style} className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary", className)}>
      {initials(name)}
    </span>
  );
}

export function Pagination({ page, size, total, baseParams }: { page: number; size: number; total: number; baseParams: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const href = (p: number) => qs({ ...baseParams, page: p > 1 ? p : undefined });
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <span>
        Hiển thị {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-1">
        <Link aria-disabled={page <= 1} className={cn("rounded-md border border-border p-1.5 hover:bg-muted", page <= 1 && "pointer-events-none opacity-40")} href={href(page - 1) || "?"}>
          <ChevronLeft className="size-4" />
        </Link>
        <span className="px-2 tabular">
          Trang {page}/{pages}
        </span>
        <Link aria-disabled={page >= pages} className={cn("rounded-md border border-border p-1.5 hover:bg-muted", page >= pages && "pointer-events-none opacity-40")} href={href(page + 1)}>
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

export function Tabs({ items, active }: { items: { key: string; label: React.ReactNode; href: string }[]; active: string }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
            t.key === active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(120px,40%)_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children || <span className="font-normal text-muted-foreground">—</span>}</dd>
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warning" | "danger"; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        tone === "info" && "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
        tone === "danger" && "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
        className,
      )}
    >
      {children}
    </div>
  );
}
