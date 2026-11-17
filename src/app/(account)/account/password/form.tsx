"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { apiFetch, useAction } from "@/lib/client";

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const { run, loading } = useAction();
  const [mismatch, setMismatch] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (fd.get("newPassword") !== fd.get("confirm")) return setMismatch(true);
        setMismatch(false);
        const ok = await run(() => apiFetch("/api/auth/change-password", { body: { currentPassword: fd.get("currentPassword"), newPassword: fd.get("newPassword") } }), "Đã đổi mật khẩu", { refresh: false });
        if (ok) window.location.href = "/";
      }}
    >
      <Field label="Mật khẩu hiện tại" required>
        <Input name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="Mật khẩu mới" required hint={`Tối thiểu ${minLength} ký tự, có chữ hoa, chữ thường và chữ số`}>
        <Input name="newPassword" type="password" autoComplete="new-password" minLength={minLength} required />
      </Field>
      <Field label="Nhập lại mật khẩu mới" required error={mismatch ? "Mật khẩu nhập lại không khớp" : undefined}>
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" loading={loading}>
        Cập nhật mật khẩu
      </Button>
    </form>
  );
}
