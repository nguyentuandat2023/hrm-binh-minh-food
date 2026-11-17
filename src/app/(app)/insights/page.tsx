import Link from "next/link";
import { AlertTriangle, Info, Lightbulb, ShieldAlert } from "lucide-react";
import { requirePagePerm } from "@/lib/auth";
import { buildInsights } from "@/lib/services/insights";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { BarChartView } from "@/components/charts";

export const metadata = { title: "HR Insights" };

const SEV = {
  high: { label: "Ưu tiên cao", tone: "red", icon: ShieldAlert },
  medium: { label: "Cần chú ý", tone: "amber", icon: AlertTriangle },
  low: { label: "Gợi ý", tone: "blue", icon: Info },
} as const;

export default async function InsightsPage() {
  const ctx = await requirePagePerm("insights.view");
  const { insights, summary, turnover } = await buildInsights(ctx);
  return (
    <div className="space-y-5">
      <PageHeader title="HR Insights" description="Cảnh báo và gợi ý dựa trên quy tắc minh bạch, tính trên dữ liệu bạn được phép xem." />
      <Notice>
        Các gợi ý chỉ mang tính hỗ trợ và luôn kèm giải thích. Hệ thống <b>không</b> tự đưa ra quyết định tuyển dụng, kỷ luật hay chấm dứt hợp đồng, không suy đoán thuộc tính nhạy cảm và không gửi dữ liệu nhân sự ra dịch vụ bên ngoài.
      </Notice>
      <Card>
        <CardHeader title="Tóm tắt nhân sự tự động" description="Sinh từ số liệu theo mẫu câu cố định" />
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {insights.length === 0 && (
        <Card>
          <EmptyState icon={<Lightbulb />} title="Không có cảnh báo nào" />
        </Card>
      )}
      <div className="grid gap-5 xl:grid-cols-2">
        {insights.map((ins) => {
          const S = SEV[ins.severity];
          return (
            <Card key={ins.title}>
              <CardHeader title={ins.title} description={<span className="flex gap-1.5"><span className="font-medium">Vì sao:</span> {ins.why}</span>} actions={<Badge tone={S.tone}>{S.label}</Badge>} />
              <ul className="max-h-96 divide-y divide-border overflow-y-auto">
                {ins.items.map((it, i) => (
                  <li key={i} className="px-5 py-2.5 text-sm">
                    {it.href ? (
                      <Link href={it.href} className="font-medium hover:underline">
                        {it.label}
                      </Link>
                    ) : (
                      <span className="font-medium">{it.label}</span>
                    )}
                    {it.detail && <p className="text-xs text-muted-foreground">{it.detail}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Xu hướng nghỉ việc 12 tháng" description={turnover.avgTenure !== null ? `Thâm niên bình quân khi nghỉ: ${turnover.avgTenure} năm` : undefined} />
          <CardContent>
            <BarChartView data={turnover.monthly} xKey="month" xLabel="Tháng" series={[{ key: "leavers", label: "Số người nghỉ việc", color: 3 }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Nghỉ việc theo phòng ban (12 tháng)" />
          <CardContent>
            <BarChartView data={turnover.byDept} xKey="name" xLabel="Phòng ban" horizontal height={Math.max(160, turnover.byDept.length * 36)} series={[{ key: "count", label: "Số người" }]} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
