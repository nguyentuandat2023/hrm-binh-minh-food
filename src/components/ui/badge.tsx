import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  default: "bg-muted text-foreground",
  primary: "bg-primary-soft text-primary",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  red: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  slate: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
};
export type BadgeTone = keyof typeof tones;

export function Badge({ tone = "default", className, children }: { tone?: BadgeTone; className?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}
