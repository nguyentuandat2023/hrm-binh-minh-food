import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Card({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-sm", className)} {...p} />;
}

export function CardHeader({ className, title, description, actions }: { className?: string; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-base font-semibold leading-tight">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardContent({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...p} />;
}

const tones = {
  default: "bg-primary-soft text-primary",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  rose: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  hint?: React.ReactNode;
  tone?: keyof typeof tones;
  href?: string;
}) {
  const inner = (
    <Card className={cn("flex h-full items-start gap-3 p-4", href && "transition-colors hover:border-primary/50")}>
      {icon && <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg [&_svg]:size-5", tones[tone])}>{icon}</div>}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-xs font-medium uppercase leading-snug tracking-wide text-muted-foreground">{label}</p>
        <p className="tabular mt-1 break-words text-2xl font-semibold leading-tight">{value}</p>
        {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}
