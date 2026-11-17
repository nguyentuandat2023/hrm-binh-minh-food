"use client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/client";

export function LoginForm({ initialStep, next }: { initialStep: "password" | "mfa"; next: string }) {
  const [step, setStep] = useState(initialStep);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const go = (mustChange: boolean) => {
    window.location.href = mustChange ? "/account/password" : next;
  };

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch<{ mfaRequired: boolean; mustChangePassword: boolean }>("/api/auth/login", {
        body: { email: fd.get("email"), password: fd.get("password") },
      });
      if (r.mfaRequired) setStep("mfa");
      else go(r.mustChangePassword);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không kết nối được máy chủ");
    } finally {
      setLoading(false);
    }
  }

  async function onMfa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const r = await apiFetch<{ mustChangePassword: boolean }>("/api/auth/mfa/verify", { body: { code: fd.get("code") } });
      go(r.mustChangePassword);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 429)) setStep("password");
      setError(err instanceof ApiError ? err.message : "Không kết nối được máy chủ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-6">
      {step === "password" ? (
        <form onSubmit={onPassword} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
          </Field>
          <Field label="Mật khẩu" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Đăng nhập
          </Button>
          <p className="text-center text-xs text-muted-foreground">Quên mật khẩu? Liên hệ bộ phận Nhân sự / Quản trị hệ thống để được đặt lại.</p>
        </form>
      ) : (
        <form onSubmit={onMfa} className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-5 text-primary" />
            <span>Nhập mã 6 số từ ứng dụng xác thực (Google/Microsoft Authenticator).</span>
          </div>
          <Field label="Mã xác thực" htmlFor="code">
            <Input id="code" name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required autoFocus className="text-center text-lg tracking-[0.4em]" />
          </Field>
          {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{error}</p>}
          <Button type="submit" className="w-full" loading={loading}>
            Xác nhận
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground hover:underline"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              setStep("password");
            }}
          >
            Đăng nhập bằng tài khoản khác
          </button>
        </form>
      )}
    </Card>
  );
}
