// Tiện ích ngày giờ theo múi giờ Asia/Ho_Chi_Minh (UTC+7, không có giờ mùa hè).
// "Date key" = chuỗi YYYY-MM-DD biểu diễn ngày lịch tại Việt Nam.
// Cột @db.Date trong DB được Prisma trả về dạng Date lúc 00:00 UTC của ngày đó.

export const TZ = "Asia/Ho_Chi_Minh";
const OFFSET_MS = 7 * 60 * 60 * 1000;

export type DateKey = string;

export function vnDateKey(d: Date = new Date()): DateKey {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Phút trong ngày (giờ VN) của một thời điểm */
export function vnMinutesOfDay(d: Date): number {
  const local = new Date(d.getTime() + OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

export function isDateKey(s: unknown): s is DateKey {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

/** Date key → Date (00:00 UTC) để ghi vào cột @db.Date */
export function dbDate(key: DateKey): Date {
  if (!isDateKey(key)) throw new Error("Ngày không hợp lệ: " + key);
  return new Date(key + "T00:00:00.000Z");
}

/** Giá trị cột @db.Date → date key */
export function keyOf(d: Date | null | undefined): DateKey | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/** Ghép ngày (VN) + giờ "HH:mm" (VN) → thời điểm UTC */
export function vnDateTime(key: DateKey, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m) - OFFSET_MS);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = dbDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return keyOf(d)!;
}

/** 0 = Chủ nhật ... 6 = Thứ bảy */
export function dayOfWeek(key: DateKey): number {
  return dbDate(key).getUTCDay();
}

export function eachDay(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function monthRange(year: number, month: number): { from: DateKey; to: DateKey; days: number } {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(days).padStart(2, "0")}`, days };
}

export function parseHHmm(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

export function isHHmm(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function yearsBetween(fromKey: DateKey, toKey: DateKey): number {
  const [y1, m1, d1] = fromKey.split("-").map(Number);
  const [y2, m2, d2] = toKey.split("-").map(Number);
  let years = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) years--;
  return Math.max(0, years);
}

export const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
