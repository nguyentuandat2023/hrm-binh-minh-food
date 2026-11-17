import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}
export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">{children}</thead>;
}
export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}
export function TR({ className, children, ...p }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("hover:bg-muted/40", className)} {...p}>
      {children}
    </tr>
  );
}
export function TH({ className, children, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("whitespace-nowrap px-4 py-2.5 font-medium", className)} {...p}>
      {children}
    </th>
  );
}
export function TD({ className, children, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-2.5 align-middle", className)} {...p}>
      {children}
    </td>
  );
}
