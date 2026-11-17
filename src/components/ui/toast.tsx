"use client";
import * as React from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; type: "success" | "error" | "info"; message: string };
const Ctx = React.createContext<(type: Toast["type"], message: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const push = React.useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, type, message }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), type === "error" ? 7000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2 rounded-lg border bg-card p-3 text-sm shadow-lg",
              t.type === "success" && "border-emerald-300 dark:border-emerald-800",
              t.type === "error" && "border-rose-300 dark:border-rose-800",
            )}
          >
            {t.type === "success" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            ) : t.type === "error" ? (
              <XCircle className="mt-0.5 size-4 shrink-0 text-rose-600" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-blue-600" />
            )}
            <p className="flex-1 whitespace-pre-line">{t.message}</p>
            <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="text-muted-foreground" aria-label="Đóng">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const push = React.useContext(Ctx);
  return React.useMemo(
    () => ({ success: (m: string) => push("success", m), error: (m: string) => push("error", m), info: (m: string) => push("info", m) }),
    [push],
  );
}
