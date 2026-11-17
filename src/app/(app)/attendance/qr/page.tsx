import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { Notice, PageHeader } from "@/components/ui/misc";
import { QrKiosk } from "./qr-kiosk";

export const metadata = { title: "Màn hình QR chấm công" };

export default async function QrPage() {
  await requirePagePerm("attendance.update");
  const [settings, branches] = await Promise.all([getSetting("attendance"), prisma.branch.findMany({ where: { isActive: true }, select: { id: true, name: true } })]);
  return (
    <div>
      <PageHeader back={{ href: "/attendance", label: "Chấm công" }} title="Màn hình QR chấm công" description="Mở trang này trên máy tính bảng/màn hình đặt tại cửa ra vào. Mã tự đổi mỗi 60 giây để chống chụp lại." />
      {settings.qrEnabled ? <QrKiosk branches={branches} /> : <Notice tone="warning">Chấm công QR đang tắt. Bật trong Cài đặt → Quy tắc chấm công.</Notice>}
    </div>
  );
}
