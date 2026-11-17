"use client";
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { apiFetch } from "@/lib/client";

export function QrKiosk({ branches }: { branches: { id: string; name: string }[] }) {
  const [branch, setBranch] = useState("");
  const [data, setData] = useState<{ qr: string; expiresAt: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      setData(await apiFetch(`/api/attendance/qr-token${branch ? `?branch=${branch}` : ""}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi tải mã");
    }
  }, [branch]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (data && Date.now() > data.expiresAt - 1000) load();
    }, 1000);
    return () => clearInterval(t);
  }, [data, load]);

  const left = data ? Math.max(0, Math.round((data.expiresAt - now) / 1000)) : 0;
  return (
    <Card className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
      <Select value={branch} onChange={(e) => setBranch(e.target.value)} aria-label="Chi nhánh">
        <option value="">Mọi chi nhánh</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {data ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.qr} alt="Mã QR chấm công" width={360} height={360} className="rounded-lg bg-white p-3" />
      ) : (
        <div className="size-[360px] animate-pulse rounded-lg bg-muted" />
      )}
      <p className="text-lg font-semibold">Quét mã bằng điện thoại để chấm công</p>
      <p className="text-sm text-muted-foreground">Mã đổi sau {left} giây · nhân viên cần đăng nhập HRM trên điện thoại</p>
    </Card>
  );
}
