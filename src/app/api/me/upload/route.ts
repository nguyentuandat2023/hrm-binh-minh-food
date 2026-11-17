import { prisma } from "@/lib/db";
import { api } from "@/lib/api";
import { saveUpload } from "@/lib/storage";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

/** Nhân viên tải giấy tờ của chính mình (đính kèm đơn nghỉ, giấy tờ bổ sung hồ sơ) */
export const POST = api(async (req, { ctx }) => {
  if (!ctx.employee) throw new HttpError(400, "Tài khoản chưa liên kết hồ sơ nhân viên");
  const form = await req.formData().catch(() => null);
  const category = String(form?.get("category") ?? "LEAVE_ATTACHMENT");
  if (!["LEAVE_ATTACHMENT", "ID_CARD", "CERTIFICATE", "OTHER"].includes(category)) throw new HttpError(400, "Loại tài liệu không hợp lệ");
  const stored = await saveUpload(form?.get("file") as File);
  const doc = await prisma.employeeDocument.create({ data: { employeeId: ctx.employee.id, category: category as "OTHER", uploadedById: ctx.userId, ...stored } });
  await audit(ctx, { action: "UPLOAD", entityType: "Employee", entityId: ctx.employee.id, summary: `Nhân viên tự tải lên "${stored.fileName}"` }, req);
  return { id: doc.id, fileName: doc.fileName };
});
