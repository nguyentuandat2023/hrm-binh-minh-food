import type { ReportResult } from "@/lib/services/reports";
import { fmtNumber, fmtVND } from "@/lib/format";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, Notice } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BarChartView, LineChartView } from "@/components/charts";
import { cn } from "@/lib/utils";

export function fmtCell(v: unknown, fmt?: string) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v !== "number") return String(v);
  if (fmt === "vnd") return fmtVND(v);
  if (fmt === "percent") return `${fmtNumber(v)}%`;
  return fmtNumber(v);
}

export function ReportView({ r, printMode = false }: { r: ReportResult; printMode?: boolean }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {r.summary.map((s) => {
          const delta = s.prev !== undefined && s.prev !== null ? s.value - s.prev : null;
          return (
            <Card key={s.label} className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="tabular mt-1 text-xl font-semibold">{fmtCell(s.value, s.fmt)}</p>
              {delta !== null && (
                <p className={cn("mt-1 text-xs", delta > 0 ? "text-emerald-600" : delta < 0 ? "text-rose-600" : "text-muted-foreground")}>
                  {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {fmtCell(Math.abs(delta), s.fmt)} so với kỳ trước ({fmtCell(s.prev, s.fmt)})
                </p>
              )}
            </Card>
          );
        })}
      </div>
      {r.note && <Notice>{r.note}</Notice>}
      {r.chart && r.chart.data.length > 0 && !printMode && (
        <Card>
          <CardHeader title="Biểu đồ" />
          <CardContent>
            {r.chart.kind === "line" ? (
              <LineChartView data={r.chart.data} xKey={r.chart.xKey} series={r.chart.series} fmt={r.chart.fmt} />
            ) : (
              <BarChartView
                data={r.chart.data}
                xKey={r.chart.xKey}
                series={r.chart.series}
                fmt={r.chart.fmt}
                stacked={r.chart.kind === "stack"}
                horizontal={r.chart.kind === "hbar"}
                height={r.chart.kind === "hbar" ? Math.max(200, r.chart.data.length * 32) : 280}
              />
            )}
          </CardContent>
        </Card>
      )}
      <Card className="print-area">
        <CardHeader title="Dữ liệu chi tiết" description={`${r.rows.length} dòng`} />
        {r.rows.length === 0 ? (
          <EmptyState title="Không có dữ liệu trong kỳ" />
        ) : (
          <Table>
            <THead>
              <tr>
                {r.columns.map((c) => (
                  <TH key={c.key} className={c.fmt && c.fmt !== "text" ? "text-right" : undefined}>
                    {c.label}
                  </TH>
                ))}
              </tr>
            </THead>
            <TBody>
              {r.rows.map((row, i) => (
                <TR key={i}>
                  {r.columns.map((c) => (
                    <TD key={c.key} className={c.fmt && c.fmt !== "text" ? "tabular text-right" : undefined}>
                      {fmtCell(row[c.key], c.fmt)}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
