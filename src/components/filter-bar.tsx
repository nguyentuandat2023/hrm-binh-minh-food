"use client";
// Bộ lọc đồng bộ với URL (search params) – server component đọc lại và truy vấn DB
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterDef {
  name: string;
  label: string;
  type: "select" | "month" | "date" | "search";
  options?: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  /** giá trị hiển thị khi URL chưa có tham số (ví dụ tháng hiện tại) */
  defaultValue?: string;
}

export function FilterBar({ filters, className }: { filters: FilterDef[]; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = React.useTransition();

  const update = (name: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`));
  };
  const hasAny = filters.some((f) => sp.get(f.name));

  return (
    <div className={cn("flex flex-wrap items-end gap-2", pending && "opacity-70", className)}>
      {filters.map((f) => {
        const value = sp.get(f.name) ?? f.defaultValue ?? "";
        if (f.type === "search") {
          return (
            <form
              key={f.name}
              className={cn("relative min-w-48 flex-1 sm:max-w-xs", f.className)}
              onSubmit={(e) => {
                e.preventDefault();
                update(f.name, String(new FormData(e.currentTarget).get(f.name) ?? "").trim());
              }}
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                key={value}
                name={f.name}
                defaultValue={value}
                aria-label={f.label}
                placeholder={f.placeholder ?? f.label}
                className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </form>
          );
        }
        if (f.type === "select") {
          return (
            <select key={f.name} aria-label={f.label} value={value} onChange={(e) => update(f.name, e.target.value)} className={cn("h-9 min-w-36 rounded-md border border-input bg-card px-2 text-sm", f.className)}>
              <option value="">{f.label}: Tất cả</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        }
        return (
          <label key={f.name} className="flex items-center gap-2 text-sm text-muted-foreground">
            {f.label}
            <input type={f.type} value={value} onChange={(e) => update(f.name, e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground" />
          </label>
        );
      })}
      {hasAny && (
        <button onClick={() => start(() => router.push(pathname))} className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted">
          <X className="size-4" /> Xoá lọc
        </button>
      )}
    </div>
  );
}
