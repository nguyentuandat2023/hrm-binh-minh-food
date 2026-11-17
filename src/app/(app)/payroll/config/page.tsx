import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { payrollParamsSchema } from "@/lib/payroll-calc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Notice, PageHeader } from "@/components/ui/misc";
import { FormDialog } from "@/components/form-dialog";
import { ConfigEditor, ActivateButton } from "./config-editor";
import { ActionButton } from "@/components/form-dialog";

export const metadata = { title: "Cấu hình lương" };

const STATUS = { DRAFT: { label: "Nháp – chưa xác minh", tone: "amber" }, ACTIVE: { label: "Đang áp dụng", tone: "green" }, ARCHIVED: { label: "Lưu trữ", tone: "slate" } } as const;

export default async function PayrollConfigPage() {
  await requirePagePerm("payroll.update");
  const configs = await prisma.payrollConfig.findMany({ orderBy: { version: "desc" } });
  const users = await prisma.user.findMany({ where: { id: { in: configs.map((c) => c.verifiedById).filter(Boolean) as string[] } }, select: { id: true, email: true } });
  return (
    <div className="space-y-5">
      <PageHeader back={{ href: "/payroll", label: "Tiền lương" }} title="Cấu hình công thức lương" description="Mỗi thay đổi tạo phiên bản mới; phiên bản phải được xác minh trước khi dùng. Kỳ lương ghi lại phiên bản đã áp dụng." />
      <Notice tone="warning">
        Hệ thống <b>không tự giả định</b> tỷ lệ BHXH/BHYT/BHTN, mức trần đóng, giảm trừ gia cảnh, biểu thuế TNCN hay hệ số tăng ca. Kế toán phải đối chiếu văn bản pháp luật có hiệu lực tại thời điểm áp dụng, ghi căn cứ vào ô xác minh rồi mới kích hoạt.
      </Notice>
      {configs.map((c) => {
        const parsed = payrollParamsSchema.safeParse(c.params);
        return (
          <Card key={c.id}>
            <CardHeader
              title={`v${c.version} · ${c.name}`}
              description={`Hiệu lực từ ${fmtDate(c.effectiveFrom)}${c.verifiedAt ? ` · xác minh ${fmtDateTime(c.verifiedAt)} bởi ${users.find((u) => u.id === c.verifiedById)?.email ?? ""}` : ""}`}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Badge>
                  <FormDialog
                    title={`Tạo phiên bản mới từ v${c.version}`}
                    url="/api/payroll/configs"
                    trigger="Sao chép thành bản mới"
                    triggerVariant="outline"
                    triggerSize="sm"
                    successMessage="Đã tạo bản nháp mới"
                    fields={[
                      { name: "copyFromId", label: "", type: "hidden", defaultValue: c.id },
                      { name: "name", label: "Tên phiên bản", required: true, defaultValue: `Cấu hình từ ${fmtDate(new Date())}` },
                      { name: "effectiveFrom", label: "Hiệu lực từ ngày", type: "date", required: true },
                    ]}
                  />
                  {c.status === "DRAFT" && <ActivateButton id={c.id} />}
                  {c.status === "ACTIVE" && <ActionButton url={`/api/payroll/configs/${c.id}`} method="PATCH" body={{ action: "archive" }} label="Lưu trữ" confirmTitle={`Lưu trữ cấu hình v${c.version}?`} />}
                </div>
              }
            />
            <CardContent className="space-y-3">
              {c.verifiedNote && <p className="rounded-md bg-muted px-3 py-2 text-sm">{c.verifiedNote}</p>}
              {parsed.success ? (
                <ConfigEditor id={c.id} name={c.name} effectiveFrom={c.effectiveFrom.toISOString().slice(0, 10)} params={parsed.data} readOnly={c.status !== "DRAFT"} />
              ) : (
                <Notice tone="danger">Tham số không hợp lệ: {parsed.error.issues[0]?.message}</Notice>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
