"use client";
import { useState } from "react";
import { FileUp } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/misc";
import { apiFetch, useAction } from "@/lib/client";

type Result = { total: number; valid: number; errors: { row: number; message: string }[]; committed: boolean };

export function ImportDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const { run, loading } = useAction();

  const send = async (commit: boolean) => {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("commit", commit ? "1" : "0");
    const r = await run(() => apiFetch<Result>("/api/employees/import", { form }), commit ? "Đã nhập dữ liệu nhân viên" : undefined, { refresh: commit });
    if (r) {
      setResult(r);
      if (r.committed) setTimeout(() => setOpen(false), 800);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => (setOpen(true), setResult(null), setFile(null))}>
        <FileUp /> Nhập Excel
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Nhập nhân viên từ Excel"
        description="Hệ thống kiểm tra toàn bộ file trước. Chỉ nhập khi tất cả các dòng hợp lệ."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Đóng
            </Button>
            <Button variant="secondary" disabled={!file} loading={loading} onClick={() => send(false)}>
              Kiểm tra file
            </Button>
            <Button disabled={!file || !result || result.errors.length > 0 || result.committed} loading={loading} onClick={() => send(true)}>
              Nhập {result?.valid ?? ""} nhân viên
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-sm">
          <p>
            Bước 1: <a className={buttonClass("link", "sm")} href="/api/employees/import">Tải file mẫu</a> (gồm danh mục mã phòng ban, chức vụ, chi nhánh).
          </p>
          <p>Bước 2: Chọn file đã điền, bấm “Kiểm tra file”, sau đó “Nhập”.</p>
          <input type="file" accept=".xlsx" onChange={(e) => (setFile(e.target.files?.[0] ?? null), setResult(null))} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2" />
          {result && (
            <div className="space-y-2">
              {result.committed ? (
                <Notice>Đã nhập thành công {result.valid} nhân viên.</Notice>
              ) : result.errors.length ? (
                <Notice tone="danger">
                  {result.errors.length} dòng lỗi / {result.total} dòng. Sửa file rồi kiểm tra lại.
                </Notice>
              ) : (
                <Notice>Tất cả {result.total} dòng hợp lệ – sẵn sàng nhập.</Notice>
              )}
              {result.errors.length > 0 && (
                <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-border p-3 text-xs">
                  {result.errors.map((e) => (
                    <li key={e.row}>
                      <b>Dòng {e.row}:</b> {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
