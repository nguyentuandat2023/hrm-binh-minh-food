import { prisma } from "@/lib/db";
import { api, fileResponse, searchParams } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { auditWhere } from "@/lib/services/audit-query";
import { buildWorkbook, XLSX_MIME } from "@/lib/excel";
import { fmtDateTime } from "@/lib/format";
import { vnDateKey } from "@/lib/dates";
import { audit } from "@/lib/audit";

export const GET = api(async (req, { ctx }) => {
  requirePerm(ctx, "admin_audit.export", "COMPANY");
  const where = auditWhere(searchParams(req));
  const items = await prisma.auditLog.findMany({ where, include: { user: { select: { email: true } } }, orderBy: { createdAt: "desc" }, take: 50000 });
  const buf = await buildWorkbook([
    {
      name: "Nhật ký",
      columns: [
        { header: "Thời gian", key: "t", width: 18 },
        { header: "Người thực hiện", key: "u", width: 28 },
        { header: "Hành động", key: "a", width: 18 },
        { header: "Đối tượng", key: "e", width: 18 },
        { header: "Nội dung", key: "s", width: 70 },
        { header: "IP", key: "ip", width: 16 },
      ],
      rows: items.map((l) => ({ t: fmtDateTime(l.createdAt), u: l.user?.email ?? "", a: l.action, e: l.entityType ?? "", s: l.summary ?? "", ip: l.ip ?? "" })),
    },
  ]);
  await audit(ctx, { action: "EXPORT", entityType: "AuditLog", summary: `Xuất nhật ký hệ thống (${items.length} dòng)` }, req);
  return fileResponse(buf, `nhat-ky-${vnDateKey()}.xlsx`, XLSX_MIME);
});
