"use client";
import { useState } from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { apiFetch, useAction } from "@/lib/client";

export function CalculateButton({ periodId, recalc }: { periodId: string; recalc: boolean }) {
  const confirm = useConfirm();
  const { run, loading } = useAction();
  const [result, setResult] = useState<{ count: number; warnings: { employee: string; message: string }[] } | null>(null);
  return (
    <>
      <Button
        loading={loading}
        onClick={async () => {
          if (recalc && !(await confirm({ title: "Tính lại bảng lương?", message: "Bảng lương nháp hiện tại sẽ được thay thế bằng kết quả mới." }))) return;
          const r = await run(() => apiFetch<{ count: number; warnings: { employee: string; message: string }[] }>(`/api/payroll/periods/${periodId}`, { body: { action: "calculate" } }), "Đã tính lương nháp");
          if (r) setResult(r);
        }}
      >
        <Calculator /> {recalc ? "Tính lại" : "Tính lương"}
      </Button>
      {result && (
        <Dialog open onClose={() => setResult(null)} title={`Đã tính ${result.count} nhân viên`} description={result.warnings.length ? "Các điểm cần kiểm tra trước khi duyệt:" : "Không có cảnh báo."} footer={<Button onClick={() => setResult(null)}>Đóng</Button>}>
          {result.warnings.length > 0 && (
            <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
              {result.warnings.map((w, i) => (
                <li key={i} className="rounded-md bg-amber-50 px-3 py-1.5 dark:bg-amber-950/40">
                  <b>{w.employee}:</b> {w.message}
                </li>
              ))}
            </ul>
          )}
        </Dialog>
      )}
    </>
  );
}
