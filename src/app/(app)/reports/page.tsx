import Link from "next/link";
import { FileDown, Printer } from "lucide-react";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { buildReport, REPORTS, type ReportType } from "@/lib/services/reports";
import { selectedBranch } from "@/lib/page-ctx";
import { orgOptions } from "@/lib/options";
import { reportFilters } from "@/lib/services/report-filters";
import { qs, spGet, type SP, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { FilterBar } from "@/components/filter-bar";
import { ReportView } from "./report-view";

export const metadata = { title: "Báo cáo" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("report.view");
  const sp = await searchParams;
  const allowed = (Object.keys(REPORTS) as ReportType[]).filter((k) => can(ctx, REPORTS[k].perm));
  const type = (allowed.includes(spGet(sp, "type") as ReportType) ? spGet(sp, "type") : allowed[0]) as ReportType;
  const f = reportFilters(sp, await selectedBranch(ctx, "report.view"));
  const [r, opts] = await Promise.all([buildReport(ctx, type, f), orgOptions()]);
  const query = { type, from: f.from, to: f.to, department: f.departmentId, branch: spGet(sp, "branch"), compare: f.compare ? "1" : undefined };
  return (
    <div>
      <PageHeader
        title="Báo cáo & phân tích"
        description={`${r.title} · ${r.period}`}
        actions={
          <>
            {can(ctx, "report.export") && (
              <a href={`/api/reports/export${qs(query)}`} className={buttonClass("outline")}>
                <FileDown /> Xuất Excel
              </a>
            )}
            {can(ctx, "report.export") && (
              <Link href={`/reports/print${qs(query)}`} target="_blank" className={buttonClass("outline")}>
                <Printer /> In / PDF
              </Link>
            )}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <Card className="h-fit p-2">
          {allowed.map((k, i) => (
            <Link key={k} href={qs({ ...query, type: k })} className={cn("block rounded-md px-3 py-2 text-sm hover:bg-muted", k === type && "bg-primary-soft font-medium text-primary")}>
              {i + 1}. {REPORTS[k].title}
            </Link>
          ))}
        </Card>
        <div className="min-w-0 space-y-4">
          <Card className="p-3">
            <FilterBar
              filters={[
                { name: "from", label: "Từ tháng", type: "month", defaultValue: f.from },
                { name: "to", label: "Đến tháng", type: "month", defaultValue: f.to },
                { name: "department", label: "Phòng ban", type: "select", options: opts.departments },
                ...(ctx.perms["report.view"] === "COMPANY" ? [{ name: "branch", label: "Chi nhánh", type: "select" as const, options: opts.branches }] : []),
                { name: "compare", label: "So sánh kỳ trước", type: "select", options: [{ value: "1", label: "Có" }] },
              ]}
            />
          </Card>
          <ReportView r={r} />
        </div>
      </div>
    </div>
  );
}
