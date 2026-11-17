"use client";
import { Upload } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch, useAction } from "@/lib/client";

export function LogoUpload({ logoFileId }: { logoFileId: string | null }) {
  const ref = useRef<HTMLInputElement>(null);
  const { run, loading } = useAction();
  return (
    <div className="space-y-3">
      {logoFileId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/logo?v=${logoFileId}`} alt="Logo công ty" className="max-h-24 rounded-md border border-border bg-white p-2" />
      ) : (
        <p className="text-sm text-muted-foreground">Chưa có logo</p>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const form = new FormData();
          form.set("file", f);
          await run(() => apiFetch("/api/admin/logo", { form }), "Đã cập nhật logo");
          e.target.value = "";
        }}
      />
      <Button variant="outline" loading={loading} onClick={() => ref.current?.click()}>
        <Upload /> Tải logo lên
      </Button>
    </div>
  );
}
