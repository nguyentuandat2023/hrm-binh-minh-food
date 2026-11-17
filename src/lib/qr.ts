import { createHmac } from "node:crypto";
import { safeEqual } from "./crypto";

const WINDOW_MS = 60_000;

function secret() {
  const s = process.env.QR_SECRET;
  if (!s || s.length < 16) throw new Error("Thiếu QR_SECRET");
  return s;
}

function sign(window: number, branch: string) {
  return createHmac("sha256", secret()).update(`qr:${window}:${branch}`).digest("base64url").slice(0, 22);
}

/** Mã QR chấm công đổi mỗi 60 giây – chống chụp ảnh mã dùng lại */
export function issueQrToken(branchId: string | null, now = Date.now()) {
  const w = Math.floor(now / WINDOW_MS);
  const b = branchId ?? "all";
  return { token: `${w}.${b}.${sign(w, b)}`, expiresAt: (w + 1) * WINDOW_MS };
}

/** Hợp lệ trong cửa sổ hiện tại hoặc ngay trước đó (tối đa ~2 phút) */
export function verifyQrToken(token: string, now = Date.now()): { ok: true; branchId: string | null } | { ok: false } {
  const [ws, b, sig] = token.split(".");
  const w = Number(ws);
  if (!Number.isInteger(w) || !b || !sig) return { ok: false };
  const cur = Math.floor(now / WINDOW_MS);
  if (w !== cur && w !== cur - 1) return { ok: false };
  if (!safeEqual(sig, sign(w, b))) return { ok: false };
  return { ok: true, branchId: b === "all" ? null : b };
}
