import QRCode from "qrcode";
import { api } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { issueQrToken } from "@/lib/qr";
import { HttpError } from "@/lib/errors";
import { getSetting } from "@/lib/settings";

/** Mã QR cho màn hình kiosk tại văn phòng (người quản lý chấm công mở trên máy tính bảng) */
export const GET = api(async (req, { ctx }) => {
  requirePerm(ctx, "attendance.update");
  const settings = await getSetting("attendance");
  if (!settings.qrEnabled) throw new HttpError(400, "Chấm công QR đang tắt trong cấu hình");
  const branch = req.nextUrl.searchParams.get("branch") || null;
  const { token, expiresAt } = issueQrToken(branch);
  const base = process.env.APP_URL || req.nextUrl.origin;
  const url = `${base}/checkin?t=${encodeURIComponent(token)}`;
  return { url, expiresAt, qr: await QRCode.toDataURL(url, { margin: 1, width: 360, errorCorrectionLevel: "M" }) };
});
