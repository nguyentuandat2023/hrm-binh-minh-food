import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { orgOptions } from "@/lib/options";
import { fmtDate } from "@/lib/format";
import { CANDIDATE_STAGE, JOB_STATUS, toOptions } from "@/lib/labels";
import { spGet, type SP } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { FilterBar } from "@/components/filter-bar";
import { FormDialog } from "@/components/form-dialog";
import { jobFields } from "./job-fields";

export const metadata = { title: "Tuyển dụng" };

export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePagePerm("recruitment.view");
  const sp = await searchParams;
  const status = spGet(sp, "status");
  const scopeDept = ctx.perms["recruitment.view"] === "COMPANY" ? {} : { departmentId: { in: ctx.departmentIds } };
  const [jobs, opts] = await Promise.all([
    prisma.recruitmentJob.findMany({
      where: { ...scopeDept, ...(status ? { status: status as never } : { status: { not: "CLOSED" } }) },
      include: { department: { select: { name: true } }, branch: { select: { name: true } }, candidates: { select: { stage: true } } },
      orderBy: { createdAt: "desc" },
    }),
    orgOptions(),
  ]);
  const funnel = ["APPLIED", "SCREENING", "INTERVIEW", "ASSESSMENT", "OFFER", "HIRED"];
  return (
    <div>
      <PageHeader
        title="Tuyển dụng"
        description="Nhu cầu → Đăng tuyển → Nhận hồ sơ → Sàng lọc → Phỏng vấn → Đánh giá → Đề nghị → Tiếp nhận. Mọi quyết định tuyển dụng do con người thực hiện."
        actions={can(ctx, "recruitment.create", "COMPANY") && <FormDialog title="Thêm vị trí tuyển dụng" url="/api/recruitment/jobs" fields={jobFields(opts)} trigger="Thêm vị trí" icon="plus" size="lg" />}
      />
      <Card className="mb-4 p-3">
        <FilterBar filters={[{ name: "status", label: "Trạng thái", type: "select", options: toOptions(JOB_STATUS) }]} />
      </Card>
      {jobs.length === 0 ? (
        <Card>
          <EmptyState title="Không có vị trí đang tuyển" />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {jobs.map((j) => (
            <Link key={j.id} href={`/recruitment/${j.id}`}>
              <Card className="h-full p-5 transition-colors hover:border-primary/50">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{j.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {j.code} · {j.department?.name ?? "—"} · {j.branch?.name ?? "—"} · cần {j.headcount}
                      {j.deadline ? ` · hạn ${fmtDate(j.deadline)}` : ""}
                    </p>
                  </div>
                  <Badge tone={JOB_STATUS[j.status].tone}>{JOB_STATUS[j.status].label}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-6 gap-1 text-center text-[11px]">
                  {funnel.map((s) => (
                    <div key={s} className="rounded-md bg-muted px-1 py-1.5">
                      <p className="tabular text-base font-semibold">{j.candidates.filter((c) => c.stage === s).length}</p>
                      <p className="truncate text-muted-foreground">{CANDIDATE_STAGE[s].label}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
