/**
 * Origin công khai của ứng dụng.
 * APP_URL có thể rỗng hoặc dở dang – ví dụ trên Railway `https://${{RAILWAY_PUBLIC_DOMAIN}}`
 * thành "https://" khi chưa cấp tên miền – nên phải đọc an toàn, không được ném lỗi.
 */
export function appOrigin(raw: string | undefined = process.env.APP_URL): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const u = new URL(value);
    if (!u.host || (u.protocol !== "https:" && u.protocol !== "http:")) return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Origin để tạo link gửi cho người dùng (QR…): ưu tiên APP_URL hợp lệ, sau đó tới Host mà proxy chuyển tới */
export function publicOrigin(headers: Headers, fallback: string): string {
  const fromEnv = appOrigin();
  if (fromEnv) return fromEnv;
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (!host) return fallback;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const scheme = proto === "http" || proto === "https" ? proto : new URL(fallback).protocol.slice(0, -1);
  return `${scheme}://${host}`;
}
