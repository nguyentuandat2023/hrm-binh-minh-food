import { prisma } from "@/lib/db";
import { api } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { saveUpload } from "@/lib/storage";
import { saveSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";

export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "admin_setting.update", "COMPANY");
  const form = await req.formData();
  const stored = await saveUpload(form.get("file") as File, { imagesOnly: true });
  const doc = await prisma.employeeDocument.create({ data: { category: "OTHER", uploadedById: ctx.userId, ...stored } });
  await saveSetting("company", { logoFileId: doc.id }, ctx.userId);
  await audit(ctx, { action: "SETTINGS_CHANGED", entityType: "Setting", entityId: "company", summary: "Cập nhật logo công ty" }, req);
  return { id: doc.id };
});
