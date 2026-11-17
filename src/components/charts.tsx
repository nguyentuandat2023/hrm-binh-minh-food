"use client";
// Biểu đồ dùng Recharts. Quy tắc: 1 trục, màu theo thứ tự cố định (không xoay vòng), nét mảnh,
// đầu cột bo 4px, tooltip khi rê chuột, chú giải khi ≥ 2 chuỗi, luôn có bảng dữ liệu đi kèm.
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtNumber } from "@/lib/format";

export const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

export interface Series {
  key: string;
  label: string;
  /** chỉ số màu cố định theo thực thể, không theo thứ hạng */
  color?: number;
}

type Row = Record<string, string | number | null>;
type Fmt = "number" | "vnd" | "percent" | "compact";

function format(v: unknown, f: Fmt = "number"): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v ?? "");
  if (f === "vnd") return n >= 1e9 ? `${fmtNumber(n / 1e9)} tỷ` : n >= 1e6 ? `${fmtNumber(Math.round(n / 1e5) / 10)} tr` : fmtNumber(n);
  if (f === "percent") return `${fmtNumber(n)}%`;
  if (f === "compact") return n >= 1e6 ? `${fmtNumber(n / 1e6)}tr` : fmtNumber(n);
  return fmtNumber(n);
}

const axisProps = { tick: { fill: "var(--muted-foreground)", fontSize: 12 }, axisLine: false, tickLine: false } as const;

function TooltipBox({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; fmt: Fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-muted-foreground">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <span className="tabular font-medium text-foreground">{format(p.value, fmt)}</span>
        </p>
      ))}
    </div>
  );
}

function DataTable({ data, xKey, series, fmt, xLabel }: { data: Row[]; xKey: string; series: Series[]; fmt: Fmt; xLabel: string }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">Xem bảng dữ liệu</summary>
      <div className="mt-2 max-h-56 overflow-auto rounded-md border border-border">
        <table className="w-full">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-2 py-1 text-left">{xLabel}</th>
              {series.map((s) => (
                <th key={s.key} className="px-2 py-1 text-right">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-2 py-1">{r[xKey]}</td>
                {series.map((s) => (
                  <td key={s.key} className="tabular px-2 py-1 text-right">
                    {format(r[s.key], fmt)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Empty() {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Chưa có dữ liệu trong khoảng thời gian này</div>;
}

export function BarChartView({
  data,
  xKey,
  series,
  fmt = "number",
  stacked = false,
  horizontal = false,
  height = 260,
  xLabel = "",
}: {
  data: Row[];
  xKey: string;
  series: Series[];
  fmt?: Fmt;
  stacked?: boolean;
  horizontal?: boolean;
  height?: number;
  xLabel?: string;
}) {
  const hasData = data.length > 0 && data.some((r) => series.some((s) => Number(r[s.key]) > 0));
  return (
    <div>
      <div style={{ height }}>
        {!hasData ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 8 : 0 }} barGap={2} barCategoryGap="28%">
              <CartesianGrid stroke="var(--chart-grid)" vertical={horizontal} horizontal={!horizontal} />
              {horizontal ? (
                <>
                  <XAxis type="number" {...axisProps} tickFormatter={(v) => format(v, fmt === "vnd" ? "vnd" : "compact")} allowDecimals={false} />
                  <YAxis type="category" dataKey={xKey} {...axisProps} width={130} />
                </>
              ) : (
                <>
                  <XAxis dataKey={xKey} {...axisProps} />
                  <YAxis {...axisProps} width={48} tickFormatter={(v) => format(v, fmt === "vnd" ? "vnd" : "compact")} allowDecimals={false} />
                </>
              )}
              <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<TooltipBox fmt={fmt} />} />
              {series.length > 1 && <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />}
              {series.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  stackId={stacked ? "a" : undefined}
                  fill={SERIES_COLORS[s.color ?? i]}
                  stroke="var(--card)"
                  strokeWidth={stacked ? 1 : 0}
                  radius={stacked ? (i === series.length - 1 ? (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) : 0) : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                  maxBarSize={horizontal ? 18 : 36}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
      {hasData && <DataTable data={data} xKey={xKey} series={series} fmt={fmt} xLabel={xLabel} />}
    </div>
  );
}

export function LineChartView({ data, xKey, series, fmt = "number", height = 260, xLabel = "" }: { data: Row[]; xKey: string; series: Series[]; fmt?: Fmt; height?: number; xLabel?: string }) {
  const hasData = data.length > 0;
  return (
    <div>
      <div style={{ height }}>
        {!hasData ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey={xKey} {...axisProps} />
              <YAxis {...axisProps} width={48} tickFormatter={(v) => format(v, fmt === "vnd" ? "vnd" : fmt === "percent" ? "percent" : "compact")} />
              <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} content={<TooltipBox fmt={fmt} />} />
              {series.length > 1 && <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 12 }} />}
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={SERIES_COLORS[s.color ?? i]}
                  strokeWidth={2}
                  dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: SERIES_COLORS[s.color ?? i] }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--card)" }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
      {hasData && <DataTable data={data} xKey={xKey} series={series} fmt={fmt} xLabel={xLabel} />}
    </div>
  );
}

/** Thanh tỷ lệ (thay cho biểu đồ tròn) – mỗi phần có nhãn tên + số, không chỉ dựa vào màu */
export function ShareBar({ parts }: { parts: { label: string; value: number; color?: number }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="text-sm text-muted-foreground">Chưa có dữ liệu</p>;
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full">
        {parts
          .filter((p) => p.value > 0)
          .map((p, i) => (
            <div key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: SERIES_COLORS[p.color ?? i] }} />
          ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {parts.map((p, i) => (
          <span key={p.label} className="inline-flex items-center gap-2">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: SERIES_COLORS[p.color ?? i] }} />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="tabular font-medium">
              {p.value} ({Math.round((p.value / total) * 100)}%)
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
