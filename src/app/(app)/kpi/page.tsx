import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can, canAccessEmployee } from "@/lib/rbac";
import { employeeListWhere } from "@/lib/services/employee";
import { orgOptions } from "@/lib/options";
import { kpiCompletion, kpiRating, weightedScore } from "@/lib/kpi-calc";
import { vnDateKey } from "@/lib/dates";
import { KPI_CATEGORY, KPI_STATUS } from "@/lib/labels";
import { spGet, type SP } from "@/lib/utils";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Tabs } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterBar } from "@/components/filter-bar";
import { ActionButton, FormDialog } from "@/components/form-dialog";
import { LineChartView } from "@/components/charts";
import { AssignKpiDialog } from "./kpi-client";

export const metadata = { title: "KPI" };

export default async function KpiPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("kpi.view");
  const sp = await searchParams;
  const tab = spGet(sp, "tab") ?? "period";
  const period = spGet(sp, "period") ?? vnDateKey().slice(0, 7);
  const opts = await orgOptions();
  const empWhere = employeeListWhere(ctx, { departmentId: spGet(sp, "department"), q: spGet(sp, "q") }, "kpi.view");
  const defs = await prisma.kpiDefinition.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  const periods = (await prisma.kpiAssignment.findMany({ distinct: ["period"], select: { period: true }, orderBy: { period: "desc" }, take: 24 })).map((p) => p.period);
  if (!periods.includes(period)) periods.unshift(period);
  const tabs = [
    { key: "period", label: "KPI theo kỳ", href: `?tab=period&period=${period}` },
    { key: "compare", label: "So sánh kỳ", href: "?tab=compare" },
    { key: "definitions", label: "Danh mục KPI", href: "?tab=definitions" },
  ];
  const canAssign = can(ctx, "kpi.create");
  const assignable = canAssign ? await prisma.employee.findMany({ where: { AND: [employeeListWhere(ctx, {}, "kpi.create"), { status: { not: "RESIGNED" } }] }, select: { id: true, fullName: true, code: true, department: { select: { name: true } } }, orderBy: { fullName: "asc" } }) : [];

  let body: React.ReactNode;
  if (tab === "definitions") {
    const fields = (d?: (typeof defs)[number]) => [
      ...(d ? [{ name: "id", label: "", type: "hidden" as const, defaultValue: d.id }] : []),
      { name: "code", label: "Mã", required: true, defaultValue: d?.code },
      { name: "name", label: "Tên KPI", required: true, defaultValue: d?.name },
      { name: "category", label: "Nhóm", type: "select" as const, required: true, options: Object.entries(KPI_CATEGORY).map(([value, label]) => ({ value, label })), defaultValue: d?.category ?? "TASK" },
      { name: "unit", label: "Đơn vị đo", required: true, defaultValue: d?.unit ?? "%" },
      { name: "direction", label: "Chiều đánh giá", type: "select" as const, required: true, options: [{ value: "HIGHER_BETTER", label: "Càng cao càng tốt" }, { value: "LOWER_BETTER", label: "Càng thấp càng tốt" }], defaultValue: d?.direction ?? "HIGHER_BETTER" },
      { name: "description", label: "Mô tả / cách đo", type: "textarea" as const, defaultValue: d?.description },
      { name: "isActive", label: "Đang sử dụng", type: "checkbox" as const, defaultValue: d?.isActive ?? true },
    ];
    body = (
      <Card>
        <CardHeader title="Danh mục chỉ tiêu KPI" actions={canAssign && <FormDialog title="Thêm KPI" url="/api/kpi/definitions" fields={fields()} trigger="Thêm KPI" icon="plus" />} />
        <Table>
          <THead>
            <tr>
              <TH>KPI</TH>
              <TH>Nhóm</TH>
              <TH>Đơn vị</TH>
              <TH>Chiều</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {defs.map((d) => (
              <TR key={d.id} className={d.isActive ? undefined : "opacity-50"}>
                <TD>
                  <span className="font-medium">{d.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{d.code}</span>
                </TD>
                <TD>{KPI_CATEGORY[d.category]}</TD>
                <TD>{d.unit}</TD>
                <TD>{d.direction === "HIGHER_BETTER" ? "↑ Cao tốt" : "↓ Thấp tốt"}</TD>
                <TD className="text-right">{canAssign && <FormDialog title={`Sửa ${d.name}`} url="/api/kpi/definitions" fields={fields(d)} trigger="Sửa" triggerVariant="ghost" triggerSize="sm" />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    );
  } else if (tab === "compare") {
    const lastPeriods = periods.filter((p) => /^\d{4}-\d{2}$/.test(p)).slice(0, 6).reverse();
    const assigns = await prisma.kpiAssignment.findMany({
      where: { period: { in: lastPeriods }, employee: empWhere },
      include: { definition: { select: { direction: true } }, results: { orderBy: { recordedAt: "desc" }, take: 1 }, employee: { select: { id: true, fullName: true, code: true, department: { select: { name: true } } } } },
    });
    const emps = new Map<string, { name: string; dept: string; scores: Record<string, number | null> }>();
    for (const a of assigns) {
      const e = a.employee!;
      const row = emps.get(e.id) ?? { name: e.fullName, dept: e.department?.name ?? "", scores: {} };
      emps.set(e.id, row);
    }
    for (const [id, row] of emps) {
      for (const p of lastPeriods) {
        const mine = assigns.filter((a) => a.employee!.id === id && a.period === p);
        const s = weightedScore(mine.map((a) => ({ weight: a.weight, completion: kpiCompletion(a.definition.direction, a.target, a.results[0]?.value) })));
        row.scores[p] = s === null ? null : Math.round(s * 1000) / 10;
      }
    }
    const trend = lastPeriods.map((p) => {
      const vals = [...emps.values()].map((r) => r.scores[p]).filter((x): x is number => x !== null);
      return { period: p, avg: vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0 };
    });
    body = (
      <div className="space-y-5">
        <Card>
          <CardHeader title="Xu hướng điểm KPI bình quân" />
          <div className="p-5">
            <LineChartView data={trend} xKey="period" xLabel="Kỳ" fmt="percent" series={[{ key: "avg", label: "Điểm bình quân (%)" }]} />
          </div>
        </Card>
        <Card>
          <div className="border-b border-border p-3">
            <FilterBar filters={[{ name: "q", label: "Tìm nhân viên", type: "search" }, { name: "department", label: "Phòng ban", type: "select", options: opts.departments }]} />
          </div>
          {emps.size === 0 ? (
            <EmptyState title="Chưa có dữ liệu KPI" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Nhân viên</TH>
                  {lastPeriods.map((p) => (
                    <TH key={p} className="text-right">
                      {p}
                    </TH>
                  ))}
                  <TH className="text-right">Thay đổi</TH>
                </tr>
              </THead>
              <TBody>
                {[...emps.entries()].map(([id, r]) => {
                  const vals = lastPeriods.map((p) => r.scores[p]).filter((x): x is number => x !== null);
                  const delta = vals.length >= 2 ? vals[vals.length - 1] - vals[vals.length - 2] : null;
                  return (
                    <TR key={id}>
                      <TD>
                        <span className="font-medium">{r.name}</span>
                        <span className="block text-xs text-muted-foreground">{r.dept}</span>
                      </TD>
                      {lastPeriods.map((p) => (
                        <TD key={p} className="tabular text-right">
                          {r.scores[p] === null ? "—" : `${r.scores[p]}%`}
                        </TD>
                      ))}
                      <TD className={`tabular text-right ${delta === null ? "" : delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{delta === null ? "—" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(delta * 10) / 10)}`}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    );
  } else {
    const assigns = await prisma.kpiAssignment.findMany({
      where: { period, OR: [{ employee: empWhere }, ...(ctx.perms["kpi.view"] === "COMPANY" ? [{ departmentId: { not: null } }] : ctx.departmentIds.length ? [{ departmentId: { in: ctx.departmentIds } }] : [])] },
      include: { definition: true, results: { orderBy: { recordedAt: "desc" }, take: 1 }, employee: { select: { id: true, fullName: true, code: true, departmentId: true, branchId: true, managerId: true, department: { select: { name: true } } } }, department: { select: { name: true } } },
      orderBy: [{ employee: { fullName: "asc" } }],
    });
    const groups = new Map<string, typeof assigns>();
    for (const a of assigns) {
      const k = a.employee ? a.employee.id : `dept:${a.departmentId}`;
      groups.set(k, [...(groups.get(k) ?? []), a]);
    }
    body = (
      <Card>
        <div className="border-b border-border p-3">
          <FilterBar filters={[{ name: "period", label: "Kỳ", type: "select", options: periods.map((p) => ({ value: p, label: p })) }, { name: "q", label: "Tìm nhân viên", type: "search" }, { name: "department", label: "Phòng ban", type: "select", options: opts.departments }]} />
        </div>
        {groups.size === 0 ? (
          <EmptyState title={`Chưa giao KPI cho kỳ ${period}`} />
        ) : (
          <div className="divide-y divide-border">
            {[...groups.entries()].map(([k, items]) => {
              const comps = items.map((a) => ({ a, actual: a.results[0]?.value ?? null, c: kpiCompletion(a.definition.direction, a.target, a.results[0]?.value) }));
              const score = weightedScore(comps.map((x) => ({ weight: x.a.weight, completion: x.c })));
              const rating = kpiRating(score);
              const first = items[0];
              const canReview = first.employee ? canAccessEmployee(ctx, "kpi.approve", first.employee) && first.employee.id !== ctx.employee?.id : can(ctx, "kpi.approve");
              return (
                <div key={k} className="p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      {first.employee ? (
                        <Link href={`/employees/${first.employee.id}`} className="font-semibold hover:underline">
                          {first.employee.fullName}
                        </Link>
                      ) : (
                        <span className="font-semibold">KPI tập thể: {first.department?.name}</span>
                      )}
                      <span className="ml-2 text-xs text-muted-foreground">{first.employee?.department?.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="tabular text-sm font-semibold">{score === null ? "—" : `${(score * 100).toFixed(1)}%`}</span>
                      <Badge tone={rating.tone}>{rating.label}</Badge>
                    </div>
                  </div>
                  <Table>
                    <THead>
                      <tr>
                        <TH>Chỉ tiêu</TH>
                        <TH className="text-right">Mục tiêu</TH>
                        <TH className="text-right">Thực tế</TH>
                        <TH className="text-right">Hoàn thành</TH>
                        <TH className="text-right">Trọng số</TH>
                        <TH>Trạng thái</TH>
                        <TH />
                      </tr>
                    </THead>
                    <TBody>
                      {comps.map(({ a, actual, c }) => (
                        <TR key={a.id}>
                          <TD>
                            {a.definition.name} <span className="text-xs text-muted-foreground">({a.definition.unit})</span>
                            {a.managerNote && <span className="block text-xs text-muted-foreground">Nhận xét: {a.managerNote}</span>}
                          </TD>
                          <TD className="tabular text-right">{a.target}</TD>
                          <TD className="tabular text-right">{actual ?? "—"}</TD>
                          <TD className="tabular text-right">
                            <span className="inline-flex items-center gap-2">
                              <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:inline-block">
                                <span className="block h-full bg-[var(--chart-1)]" style={{ width: `${Math.min(100, (c ?? 0) * 100)}%` }} />
                              </span>
                              {c === null ? "—" : `${Math.round(c * 100)}%`}
                            </span>
                          </TD>
                          <TD className="tabular text-right">{a.weight}</TD>
                          <TD>
                            <Badge tone={KPI_STATUS[a.status].tone}>{KPI_STATUS[a.status].label}</Badge>
                          </TD>
                          <TD className="text-right">
                            <div className="flex justify-end gap-1">
                              {a.status === "OPEN" && (canAccessEmployee(ctx, "kpi.create", a.employee ?? { id: "", departmentId: a.departmentId, branchId: null, managerId: null }) || ctx.perms["kpi.create"] === "COMPANY") && (
                                <FormDialog title={`Cập nhật kết quả: ${a.definition.name}`} url={`/api/kpi/assignments/${a.id}/results`} trigger="Kết quả" triggerVariant="ghost" triggerSize="sm" successMessage="Đã cập nhật" fields={[{ name: "value", label: `Thực tế (${a.definition.unit})`, type: "number", step: 0.01, required: true, defaultValue: actual }, { name: "note", label: "Ghi chú", type: "textarea" }]} />
                              )}
                              {canReview && a.status !== "CLOSED" && (
                                <FormDialog
                                  title={`Đánh giá: ${a.definition.name}`}
                                  url={`/api/kpi/assignments/${a.id}`}
                                  method="PATCH"
                                  trigger="Đánh giá"
                                  triggerVariant="ghost"
                                  triggerSize="sm"
                                  successMessage="Đã đánh giá"
                                  fields={[
                                    { name: "action", label: "", type: "hidden", defaultValue: "review" },
                                    { name: "managerScore", label: "Điểm quản lý chấm (%) – tuỳ chọn", type: "number", min: 0, max: 200, defaultValue: a.managerScore },
                                    { name: "managerNote", label: "Nhận xét", type: "textarea", defaultValue: a.managerNote },
                                  ]}
                                />
                              )}
                              {canReview && a.status === "REVIEWED" && <ActionButton url={`/api/kpi/assignments/${a.id}`} method="PATCH" body={{ action: "close" }} label="Chốt" variant="ghost" confirmTitle="Chốt KPI này?" />}
                            </div>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="KPI & đánh giá hiệu suất"
        description="Điểm tổng hợp = Σ(trọng số × % hoàn thành) / Σ trọng số, % hoàn thành tối đa 150%. Kết quả là gợi ý – quyết định đánh giá do người quản lý thực hiện."
        actions={canAssign && <AssignKpiDialog definitions={defs.filter((d) => d.isActive).map((d) => ({ value: d.id, label: `${d.name} (${d.unit})`, unit: d.unit }))} employees={assignable.map((e) => ({ value: e.id, label: `${e.fullName} (${e.code})`, group: e.department?.name ?? "" }))} departments={opts.departments} defaultPeriod={period} />}
      />
      <Tabs items={tabs} active={tab} />
      {body}
    </div>
  );
}
