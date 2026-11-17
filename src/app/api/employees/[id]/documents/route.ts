import { prisma } from "@/lib/db";
import { api } from "@/lib/api";
import { getEmployeeForCtx } from "@/lib/services/employee";
import { saveUpload } from "@/lib/storage";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

const CATS = ["AVATAR", "CV", "ID_CARD", "CONTRACT", "CERTIFICATE", "LEAVE_ATTACHMENT", "OTHER"] as const;

/** Tải tài liệu lên hồ sơ (multipart/form-data: file, category). category=AVATAR → đặt làm ảnh đại diện */
export const POST = api(async (req, { ctx, params }) => {
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "Yêu cầu phải là multipart/form-data");
  const category = String(form.get("category") ?? "OTHER") as (typeof CATS)[number];
  if (!CATS.includes(category)) throw new HttpError(400, "Loại tài liệu không hợp lệ");
  // Ảnh đại diện: nhân viên tự đổi được ảnh của mình; tài liệu khác cần quyền document.create
  const isSelfAvatar = category === "AVATAR" && ctx.employee?.id === params.id;
  const ref = await getEmployeeForCtx(ctx, params.id, isSelfAvatar ? "employee.view" : "document.create");
  const stored = await saveUpload(form.get("file") as File, { imagesOnly: category === "AVATAR" });
  const doc = await prisma.$transaction(async (tx) => {
    const d = await tx.employeeDocument.create({ data: { employeeId: params.id, category, uploadedById: ctx.userId, ...stored } });
    if (category === "AVATAR") await tx.employee.update({ where: { id: params.id }, data: { avatarFileId: d.id } });
    await audit(ctx, { action: "UPLOAD", entityType: "Employee", entityId: params.id, summary: `Tải lên "${stored.fileName}" (${category}) cho ${ref.fullName}` }, req, tx);
    return d;
  });
  return { id: doc.id, fileName: doc.fileName };
});
