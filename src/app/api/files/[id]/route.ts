// Tải file có kiểm tra quyền – file không bao giờ nằm trong thư mục public
import { prisma } from "@/lib/db";
import { api, fileResponse } from "@/lib/api";
import { canAccessEmployee, type AuthCtx } from "@/lib/rbac";
import { readStored } from "@/lib/storage";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

async function loadDoc(ctx: AuthCtx, id: string, action: "view" | "delete") {
  const doc = await prisma.employeeDocument.findUnique({
    where: { id },
    include: { employee: { select: { id: true, departmentId: true, branchId: true, managerId: true, fullName: true, avatarFileId: true } } },
  });
  if (!doc || doc.deletedAt) throw new HttpError(404, "Tài liệu không tồn tại");
  if (doc.employee) {
    const isAvatar = doc.employee.avatarFileId === doc.id;
    // Ảnh đại diện hiển thị cho người có quyền xem hồ sơ/sơ đồ tổ chức
    // Giấy tờ đính kèm đơn nghỉ: người có quyền duyệt/xem nghỉ phép của nhân viên đó được xem
    const leaveDoc = doc.category === "LEAVE_ATTACHMENT" && (canAccessEmployee(ctx, "leave.approve", doc.employee) || canAccessEmployee(ctx, "leave.update", doc.employee));
    const ok =
      action === "view"
        ? (isAvatar && (ctx.perms["org.view"] || canAccessEmployee(ctx, "employee.view", doc.employee))) || canAccessEmployee(ctx, "document.view", doc.employee) || leaveDoc
        : canAccessEmployee(ctx, "document.delete", doc.employee);
    if (!ok) throw new HttpError(403, "Bạn không có quyền với tài liệu này");
  } else {
    // File không gắn nhân viên: CV ứng viên (quyền tuyển dụng), logo/file nhập liệu (quản trị cấu hình)
    const ok =
      action === "view"
        ? doc.category === "CV"
          ? ctx.perms["recruitment.view"] === "COMPANY"
          : !!ctx.perms["admin_setting.view"]
        : !!ctx.perms["admin_setting.update"];
    if (!ok && doc.uploadedById !== ctx.userId) throw new HttpError(403, "Bạn không có quyền với tài liệu này");
  }
  return doc;
}

export const GET = api(async (req, { ctx, params }) => {
  const doc = await loadDoc(ctx, params.id, "view");
  const buf = await readStored(doc.storedName).catch(() => {
    throw new HttpError(404, "Không tìm thấy file trên kho lưu trữ");
  });
  const inline = req.nextUrl.searchParams.get("inline") === "1" && (doc.mimeType.startsWith("image/") || doc.mimeType === "application/pdf");
  return fileResponse(buf, doc.fileName, doc.mimeType, inline);
});

/** Xoá mềm tài liệu (giữ bản ghi để truy vết) */
export const DELETE = api(async (req, { ctx, params }) => {
  const doc = await loadDoc(ctx, params.id, "delete");
  await prisma.$transaction(async (tx) => {
    await tx.employeeDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
    if (doc.employee?.avatarFileId === doc.id) await tx.employee.update({ where: { id: doc.employee.id }, data: { avatarFileId: null } });
    await audit(ctx, { action: "DELETE", entityType: "Employee", entityId: doc.employeeId ?? undefined, summary: `Xoá tài liệu "${doc.fileName}"` }, req, tx);
  });
  return { ok: true };
});
