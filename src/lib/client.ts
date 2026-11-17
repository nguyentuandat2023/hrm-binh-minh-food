"use client";
// Gọi REST API từ trình duyệt – cookie phiên tự gửi kèm, lỗi trả về thông điệp tiếng Việt từ server.
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/toast";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
    public code?: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T = unknown>(url: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    headers: opts.form ? undefined : opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    credentials: "same-origin",
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      window.location.href = data?.code === "MFA_REQUIRED" ? "/login?step=mfa" : "/login";
    }
    throw new ApiError(res.status, data?.error ?? `Lỗi ${res.status}`, data?.fields, data?.code);
  }
  return data as T;
}

/** Hook thực hiện thao tác: hiển thị loading, toast thành công/thất bại, làm mới dữ liệu server */
export function useAction() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okMessage?: string, opts: { refresh?: boolean } = {}): Promise<T | undefined> => {
      setLoading(true);
      setFieldErrors({});
      try {
        const r = await fn();
        if (okMessage) toast.success(okMessage);
        if (opts.refresh !== false) router.refresh();
        return r;
      } catch (e) {
        if (e instanceof ApiError) {
          setFieldErrors(e.fields ?? {});
          toast.error(e.fields && Object.keys(e.fields).length ? `${e.message}: ${Object.values(e.fields).slice(0, 3).join("; ")}` : e.message);
        } else toast.error("Không kết nối được máy chủ");
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [router, toast],
  );
  return { run, loading, fieldErrors, setFieldErrors };
}

/** Đọc FormData của form thành object, bỏ chuỗi rỗng thành null */
export function formToObject(form: HTMLFormElement): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  new FormData(form).forEach((v, k) => {
    if (typeof v === "string") out[k] = v.trim() === "" ? null : v.trim();
  });
  return out;
}
