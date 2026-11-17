"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { apiFetch, useAction } from "@/lib/client";

export function MfaPanel({ enabled }: { enabled: boolean }) {
  const { run, loading } = useAction();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);

  if (enabled) {
    return (
      <form
        className="grid gap-3 sm:grid-cols-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          await run(() => apiFetch("/api/auth/mfa", { body: { action: "disable", password: fd.get("password"), code: fd.get("code") } }), "Đã tắt xác thực hai lớp");
        }}
      >
        <Field label="Mật khẩu">
          <Input name="password" type="password" required />
        </Field>
        <Field label="Mã hiện tại">
          <Input name="code" inputMode="numeric" maxLength={6} required />
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="outline" loading={loading}>
            Tắt xác thực hai lớp
          </Button>
        </div>
      </form>
    );
  }

  if (!setup) {
    return (
      <Button
        loading={loading}
        onClick={async () => {
          const r = await run(() => apiFetch<{ secret: string; qr: string }>("/api/auth/mfa", { body: { action: "setup" } }), undefined, { refresh: false });
          if (r) setSetup(r);
        }}
      >
        Bắt đầu thiết lập
      </Button>
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="Mã QR thiết lập xác thực hai lớp" className="rounded-lg border border-border bg-white p-2" width={220} height={220} />
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const ok = await run(() => apiFetch("/api/auth/mfa", { body: { action: "enable", code: fd.get("code") } }), "Đã bật xác thực hai lớp", { refresh: false });
          if (ok) window.location.href = "/account/security";
        }}
      >
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Mở ứng dụng Authenticator trên điện thoại.</li>
          <li>Quét mã QR (hoặc nhập khoá thủ công bên dưới).</li>
          <li>Nhập mã 6 số đang hiển thị để xác nhận.</li>
        </ol>
        <p className="break-all rounded-md bg-muted px-3 py-2 font-mono text-xs">{setup.secret}</p>
        <Field label="Mã xác thực">
          <Input name="code" inputMode="numeric" maxLength={6} required autoFocus className="tracking-[0.3em]" />
        </Field>
        <Button type="submit" loading={loading}>
          Xác nhận & bật
        </Button>
      </form>
    </div>
  );
}
