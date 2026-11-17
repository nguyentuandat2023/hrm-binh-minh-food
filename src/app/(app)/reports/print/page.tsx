import { requirePagePerm } from "@/lib/auth";
import { buildReport, REPORTS, type ReportType } from "@/lib/services/reports";
import { getSetting } from "@/lib/settings";
import { audit } from "@/lib/audit";
import { fmtDateTime } from "@/lib/format";
import { spGet, type SP } from "@/lib/utils";
import { PrintButton } from "@/components/print-button";
import { HttpError } from "@/lib/errors";
import { ReportView } from "../report-view";
import { reportFilters } from "@/lib/services/report-filters";

export const metadata = { title: "In báo cáo" };

export default async function PrintReport({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("report.export");
  const sp = await searchParams;
  const type = spGet(sp, "type") as ReportType;
  if (!(type in REPORTS)) throw new HttpError(404, "Loại báo cáo không tồn tại");
  const [r, company] = await Promise.all([buildReport(ctx, type, reportFilters(sp)), getSetting("company")]);
  await audit(ctx, { action: "EXPORT", entityType: "Report", summary: `In/PDF ${r.title} (${r.period})` });
  return (
    <div className="bg-white p-4 text-black">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton />
      </div>
      <p className="text-sm font-semibold">{company.name}</p>
      <h1 className="my-2 text-center text-lg font-bold uppercase">{r.title}</h1>
      <p className="mb-4 text-center text-xs">
        {r.period} · In lúc {fmtDateTime(new Date())}
      </p>
      <ReportView r={r} printMode />
    </div>
  );
}
