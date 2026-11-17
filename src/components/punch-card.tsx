"use client";
import { useEffect, useState } from "react";
import { LogIn, LogOut, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Notice } from "@/components/ui/misc";
import { apiFetch, useAction } from "@/lib/client";

type Result = { workDate: string; checkIn: string | null; checkOut: string | null; lateMinutes: number; earlyMinutes: number; workdayValue: number };

/** Thẻ chấm công vào/ra. qrToken → phương thức QR; gps → lấy vị trí trình duyệt (cần đồng ý) */
export function PunchCard({
  qrToken,
  gpsEnabled = false,
  webAllowed = true,
  consentText,
  today,
}: {
  qrToken?: string;
  gpsEnabled?: boolean;
  webAllowed?: boolean;
  consentText?: string;
  today?: { checkIn: string | null; checkOut: string | null; shift: string | null } | null;
}) {
  const { run, loading } = useAction();
  const [res, setRes] = useState<Result | null>(null);
  const [clock, setClock] = useState<string>("");
  useEffect(() => {
    const tick = () => setClock(new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const punch = async (type: "in" | "out", useGps: boolean) => {
    let lat: number | null = null;
    let lng: number | null = null;
    if (useGps) {
      try {
        const pos = await new Promise<GeolocationPosition>((ok, fail) => navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 15000 }));
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        await run(() => Promise.reject(new Error("Không lấy được vị trí. Hãy cho phép trình duyệt truy cập vị trí.")));
        return;
      }
    }
    const method = qrToken ? "QR" : useGps ? "GPS" : "WEB";
    const r = await run(() => apiFetch<Result>("/api/attendance/punch", { body: { type, method, qrToken, lat, lng } }), type === "in" ? "Đã chấm công vào ca" : "Đã chấm công ra ca");
    if (r) setRes(r);
  };

  const ci = res?.checkIn ?? today?.checkIn ?? null;
  const co = res?.checkOut ?? today?.checkOut ?? null;
  const canWeb = !!qrToken || webAllowed;

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Giờ hiện tại</p>
          <p className="tabular text-3xl font-semibold">{clock}</p>
        </div>
        {today?.shift && <p className="text-right text-xs text-muted-foreground">Ca hôm nay: {today.shift}</p>}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">Giờ vào</p>
          <p className="tabular text-lg font-semibold">{ci ?? "--:--"}</p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">Giờ ra</p>
          <p className="tabular text-lg font-semibold">{co ?? "--:--"}</p>
        </div>
      </div>
      {res && (res.lateMinutes > 0 || res.earlyMinutes > 0) && (
        <Notice tone="warning" className="mb-3">
          {res.lateMinutes > 0 && `Đi muộn ${res.lateMinutes} phút. `}
          {res.earlyMinutes > 0 && `Về sớm ${res.earlyMinutes} phút. `}
          Nếu có lý do chính đáng, hãy gửi đề nghị điều chỉnh công.
        </Notice>
      )}
      {canWeb && (
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" loading={loading} disabled={!!ci} onClick={() => punch("in", false)}>
            <LogIn /> Vào ca
          </Button>
          <Button size="lg" variant="secondary" loading={loading} disabled={!!co} onClick={() => punch("out", false)}>
            <LogOut /> Ra ca
          </Button>
        </div>
      )}
      {gpsEnabled && !qrToken && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" loading={loading} onClick={() => punch("in", true)}>
              <MapPin /> Vào ca (GPS)
            </Button>
            <Button variant="outline" loading={loading} onClick={() => punch("out", true)}>
              <MapPin /> Ra ca (GPS)
            </Button>
          </div>
          {consentText && <p className="text-xs text-muted-foreground">{consentText}</p>}
        </div>
      )}
      {!canWeb && !gpsEnabled && <Notice>Công ty yêu cầu chấm công bằng cách quét mã QR tại văn phòng.</Notice>}
    </Card>
  );
}
