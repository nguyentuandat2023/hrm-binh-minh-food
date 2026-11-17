import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomToken, sha256 } from "./crypto";
import { HttpError } from "./errors";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const ALLOWED: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/msword": [".doc"],
};

function storageDir() {
  return path.resolve(process.env.STORAGE_DIR || "./storage");
}

/** Kiểm tra chữ ký file (magic bytes) để không tin vào MIME do trình duyệt gửi lên */
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf[0] === 0x50 && buf[1] === 0x4b) return "zip"; // docx/xlsx
  if (buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "application/msword";
  return null;
}

export interface StoredFile {
  fileName: string;
  storedName: string;
  mimeType: string;
  size: number;
  sha256: string;
}

export async function saveUpload(file: File, opts: { imagesOnly?: boolean } = {}): Promise<StoredFile> {
  if (!file || typeof file.arrayBuffer !== "function") throw new HttpError(400, "Không có file");
  if (file.size === 0) throw new HttpError(400, "File rỗng");
  if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(400, "File vượt quá 10MB");
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name).toLowerCase();
  const sniffed = sniff(buf);
  let mime: string | null = null;
  if (sniffed === "zip") {
    mime =
      ext === ".docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : ext === ".xlsx"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : null;
  } else if (sniffed && ALLOWED[sniffed]?.includes(ext)) {
    mime = sniffed;
  }
  if (!mime) throw new HttpError(400, "Định dạng file không được hỗ trợ (PDF, JPG, PNG, WEBP, DOC, DOCX, XLSX)");
  if (opts.imagesOnly && !mime.startsWith("image/")) throw new HttpError(400, "Chỉ chấp nhận ảnh JPG, PNG, WEBP");
  const storedName = `${new Date().toISOString().slice(0, 7)}/${randomToken(18)}${ext}`;
  const full = path.join(storageDir(), storedName);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf, { mode: 0o600 });
  const safeName = path.basename(file.name).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").slice(0, 200);
  return { fileName: safeName, storedName, mimeType: mime, size: buf.length, sha256: sha256(buf) };
}

export async function readStored(storedName: string): Promise<Buffer> {
  const base = storageDir();
  const full = path.resolve(base, storedName);
  if (!full.startsWith(base + path.sep)) throw new HttpError(400, "Đường dẫn không hợp lệ");
  return readFile(full);
}
