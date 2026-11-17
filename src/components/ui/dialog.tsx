"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = ref.current?.querySelector<HTMLElement>("input,select,textarea,button:not([data-close])");
    first?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  const width = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" onClick={onClose} />
      <div ref={ref} className={cn("relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-border bg-card shadow-xl sm:rounded-xl", width)}>
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button data-close onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Đóng">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

type ConfirmOpts = { title: string; message?: React.ReactNode; confirmText?: string; danger?: boolean; requireText?: string };
const ConfirmCtx = React.createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = React.useState("");
  const confirm = React.useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => (setTyped(""), setState({ ...o, resolve }))), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  const blocked = !!state?.requireText && typed.trim() !== state.requireText;
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Dialog
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => close(false)}>
              Huỷ
            </Button>
            <Button variant={state?.danger ? "destructive" : "default"} disabled={blocked} onClick={() => close(true)}>
              {state?.confirmText ?? "Xác nhận"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          {state?.message && <div className="text-muted-foreground">{state.message}</div>}
          {state?.requireText && (
            <div>
              <p className="mb-1">
                Nhập <b>{state.requireText}</b> để xác nhận:
              </p>
              <input className="h-9 w-full rounded-md border border-input bg-card px-3" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </div>
          )}
        </div>
      </Dialog>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => React.useContext(ConfirmCtx);
