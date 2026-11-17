import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { orgOptions } from "@/lib/options";
import { fmtDate } from "@/lib/format";
import { JOB_STATUS } from "@/lib/labels";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { FormDialog } from "@/components/form-dialog";
import { jobFields } from "../job-fields";
import { AddCandidate, Pipeline } from "./pipeline";

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePerm("recruitment.view");
  const { id } = await params;
  const job = await prisma.recruitmentJob.findUnique({
    where: { id },
    include: {
      department: { select: { name: true } },
      candidates: { include: { interviews: { orderBy: { scheduledAt: "desc" } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!job) notFound();
  if (ctx.perms["recruitment.view"] !== "COMPANY" && !(job.departmentId && ctx.departmentIds.includes(job.departmentId))) notFound();
  const opts = await orgOptions();
  const canEdit = can(ctx, "recruitment.update", "COMPANY");
  return (
    <div>
      <PageHeader
        back={{ href: "/recruitment", label: "Tuyển dụng" }}
        title={job.title}
        description={`${job.code} · ${job.department?.name ?? "—"} · cần ${job.headcount}${job.salaryRange ? ` · ${job.salaryRange}` : ""}${job.deadline ? ` · hạn ${fmtDate(job.deadline)}` : ""}`}
        actions={
          <>
            <Badge tone={JOB_STATUS[job.status].tone} className="px-3 py-1">
              {JOB_STATUS[job.status].label}
            </Badge>
            {canEdit && <FormDialog title="Sửa vị trí" url="/api/recruitment/jobs" fields={jobFields(opts, job)} trigger="Sửa vị trí" triggerVariant="outline" size="lg" />}
            {can(ctx, "recruitment.create", "COMPANY") && job.status !== "CLOSED" && <AddCandidate jobId={job.id} />}
          </>
        }
      />
      {(job.description || job.requirements) && (
        <Card className="mb-4 grid gap-4 p-4 text-sm md:grid-cols-2">
          {job.description && (
            <div>
              <p className="mb-1 font-medium">Mô tả công việc</p>
              <p className="whitespace-pre-line text-muted-foreground">{job.description}</p>
            </div>
          )}
          {job.requirements && (
            <div>
              <p className="mb-1 font-medium">Yêu cầu</p>
              <p className="whitespace-pre-line text-muted-foreground">{job.requirements}</p>
            </div>
          )}
        </Card>
      )}
      <Pipeline
        canEdit={canEdit}
        canHire={canEdit && can(ctx, "employee.create", "COMPANY")}
        employees={opts.employees}
        departments={opts.departments}
        positions={opts.positions}
        job={{ departmentId: job.departmentId, positionId: job.positionId, branchId: job.branchId }}
        candidates={job.candidates.map((c) => ({
          id: c.id,
          fullName: c.fullName,
          email: c.email,
          phone: c.phone,
          source: c.source,
          stage: c.stage,
          rating: c.rating,
          notes: c.notes,
          cvFileId: c.cvFileId,
          hiredEmployeeId: c.hiredEmployeeId,
          createdAt: c.createdAt.toISOString(),
          interviews: c.interviews.map((i) => ({ id: i.id, scheduledAt: i.scheduledAt.toISOString(), location: i.location, interviewers: i.interviewers, result: i.result, score: i.score, notes: i.notes })),
        }))}
      />
    </div>
  );
}
