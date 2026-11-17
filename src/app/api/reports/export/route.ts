import { api, fileResponse, searchParams } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { buildReport, REPORTS, type ReportType } from "@/lib/services/reports";
import { buildWorkbook, XLSX_MIME } from "@/lib/excel";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";

export const GET = api(async (req, { ctx }) => {
  requirePerm(ctx, "report.export");
  const sp = searchParams(req);
  const type = sp.type as ReportType;
  if (!(type in REPORTS)) throw new HttpError(404, "Loại báo cáo không tồn tại");
  const ok = (s?: string) => (s && /^\d{4}-\d{2}$/.test(s) ? s : undefined);
  const from = ok(sp.from) ?? new Date().toISOString().slice(0, 7);
  const r = await buildReport(ctx, type, { from, to: ok(sp.to) ?? from, departmentId: sp.department || undefined, branchId: sp.branch || undefined, compare: sp.compare === "1" });
  const numFmt = (f?: string) => (f === "vnd" ? "#,##0" : f === "number" || f === "percent" ? "#,##0.##" : undefined);
  const buf = await buildWorkbook([
    { name: "Chi tiết", title: `${r.title.toUpperCase()} – ${r.period}`, columns: r.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 4), numFmt: numFmt(c.fmt) })), rows: r.rows },
    { name: "Tổng hợp", columns: [{ header: "Chỉ tiêu", key: "label", width: 40 }, { header: "Giá trị", key: "value", width: 20, numFmt: "#,##0.##" }, { header: "Kỳ trước", key: "prev", width: 20, numFmt: "#,##0.##" }], rows: r.summary },
  ]);
  await audit(ctx, { action: "EXPORT", entityType: "Report", summary: `Xuất Excel ${r.title} (${r.period})` }, req);
  return fileResponse(buf, `bao-cao-${type}-${from}.xlsx`, XLSX_MIME);
});
