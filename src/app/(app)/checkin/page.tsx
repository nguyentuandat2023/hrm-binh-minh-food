import { requirePageAuth } from "@/lib/auth";
import { verifyQrToken } from "@/lib/qr";
import { Notice, PageHeader } from "@/components/ui/misc";
import { PunchCard } from "@/components/punch-card";
import { spGet, type SP } from "@/lib/utils";

export const metadata = { title: "Chấm công QR" };

/** Trang mở ra khi nhân viên quét mã QR tại văn phòng */
export default async function CheckinPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePageAuth();
  const t = spGet(await searchParams, "t") ?? "";
  const valid = verifyQrToken(t).ok;
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Chấm công bằng mã QR" />
      {!ctx.employee ? (
        <Notice tone="warning">Tài khoản chưa liên kết hồ sơ nhân viên.</Notice>
      ) : !valid ? (
        <Notice tone="danger">Mã QR không hợp lệ hoặc đã hết hạn. Vui lòng quét lại mã đang hiển thị trên màn hình.</Notice>
      ) : (
        <PunchCard qrToken={t} />
      )}
    </div>
  );
}
