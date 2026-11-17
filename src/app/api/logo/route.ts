// Logo công ty – công khai (hiển thị ở trang đăng nhập và thanh bên cho mọi người dùng).
// Chỉ phục vụ đúng file ảnh được chọn làm logo trong Cài đặt → Cấu hình doanh nghiệp.
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { readStored } from "@/lib/storage";

export async function GET() {
  const company = await getSetting("company");
  if (!company.logoFileId) return new Response(null, { status: 404 });
  const doc = await prisma.employeeDocument.findUnique({ where: { id: company.logoFileId } });
  if (!doc || doc.deletedAt || doc.employeeId || !doc.mimeType.startsWith("image/")) return new Response(null, { status: 404 });
  try {
    const buf = await readStored(doc.storedName);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": doc.mimeType, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
