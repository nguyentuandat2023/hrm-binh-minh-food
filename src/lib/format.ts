import { TZ } from "./dates";

const dateFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const timeFmt = new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const vnd = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

/** Định dạng ngày dd/MM/yyyy. Nhận Date (thời điểm) hoặc date key YYYY-MM-DD hoặc Date của cột @db.Date */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  if (typeof d === "string") {
    const [y, m, day] = d.slice(0, 10).split("-");
    return `${day}/${m}/${y}`;
  }
  // Cột @db.Date là 00:00 UTC – định dạng theo UTC để không lệch ngày
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  }
  return dateFmt.format(d);
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  return dateTimeFmt.format(typeof d === "string" ? new Date(d) : d).replace(",", "");
}

export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  return timeFmt.format(typeof d === "string" ? new Date(d) : d);
}

export function fmtVND(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return vnd.format(n);
}

export function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "";
  return num.format(n);
}

export function fmtMinutes(min: number): string {
  if (!min) return "0p";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}g${m ? String(m).padStart(2, "0") : ""}` : `${m}p`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu */
export function unaccent(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}
