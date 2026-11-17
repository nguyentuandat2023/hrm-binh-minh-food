"use client";
import { useState } from "react";
import Link from "next/link";
import { Copy, FileText, Star, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { apiFetch, useAction } from "@/lib/client";
import { CANDIDATE_STAGE } from "@/lib/labels";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type Interview = { id: string; scheduledAt: string; location: string | null; interviewers: string | null; result: string; score: number | null; notes: string | null };
type Cand = { id: string; fullName: string; email: string | null; phone: string | null; source: string | null; stage: string; rating: number | null; notes: string | null; cvFileId: string | null; hiredEmployeeId: string | null; createdAt: string; interviews: Interview[] };
type Opt = { value: string; label: string };

const COLUMNS = ["APPLIED", "SCREENING", "INTERVIEW", "ASSESSMENT", "OFFER", "HIRED"];

export function AddCandidate({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const { run, loading, fieldErrors } = useAction();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus /> Thêm ứng viên
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Thêm ứng viên">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            form.set("jobId", jobId);
            if ((await run(() => apiFetch("/api/recruitment/candidates", { form }), "Đã thêm ứng viên")) !== undefined) setOpen(false);
          }}
        >
          <Field label="Họ tên" required error={fieldErrors.fullName}>
            <Input name="fullName" required />
          </Field>
          <Field label="Nguồn" hint="Website, giới thiệu, mạng xã hội…">
            <Input name="source" />
          </Field>
          <Field label="Email" error={fieldErrors.email}>
            <Input name="email" type="email" />
          </Field>
          <Field label="Điện thoại" error={fieldErrors.phone}>
            <Input name="phone" />
          </Field>
          <Field label="CV (PDF/DOCX/ảnh, ≤10MB)" className="sm:col-span-2">
            <input type="file" name="cv" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2" />
          </Field>
          <Field label="Ghi chú" className="sm:col-span-2">
            <Textarea name="notes" />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={loading}>
              Lưu ứng viên
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function Pipeline({ candidates, canEdit, canHire, employees, departments, positions, job }: { candidates: Cand[]; canEdit: boolean; canHire: boolean; employees: Opt[]; departments: Opt[]; positions: Opt[]; job: { departmentId: string | null; positionId: string | null; branchId: string | null } }) {
  const [sel, setSel] = useState<Cand | null>(null);
  const closed = candidates.filter((c) => c.stage === "REJECTED" || c.stage === "WITHDRAWN");
  return (
    <>
      <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6">
        {COLUMNS.map((col) => {
          const items = candidates.filter((c) => c.stage === col);
          return (
            <div key={col} className="min-w-52 rounded-xl bg-muted/50 p-2">
              <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {CANDIDATE_STAGE[col].label} <span className="tabular">{items.length}</span>
              </p>
              <div className="space-y-2">
                {items.map((c) => (
                  <button key={c.id} onClick={() => setSel(c)} className="block w-full text-left">
                    <Card className="p-3 transition-colors hover:border-primary/50">
                      <p className="font-medium">{c.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.email ?? c.phone ?? ""}</p>
                      <div className="mt-1 flex items-center justify-between text-xs">
                        <span className="flex">{c.rating ? Array.from({ length: c.rating }).map((_, i) => <Star key={i} className="size-3 fill-amber-400 text-amber-400" />) : <span className="text-muted-foreground">Chưa chấm</span>}</span>
                        {c.cvFileId && <FileText className="size-3.5 text-muted-foreground" aria-label="Có CV" />}
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {closed.length > 0 && (
        <p className="mt-3 text-sm text-muted-foreground">
          Không đạt / rút hồ sơ:{" "}
          {closed.map((c, i) => (
            <button key={c.id} onClick={() => setSel(c)} className="hover:underline">
              {c.fullName}
              {i < closed.length - 1 ? ", " : ""}
            </button>
          ))}
        </p>
      )}
      {sel && <CandidateDialog c={sel} onClose={() => setSel(null)} canEdit={canEdit} canHire={canHire} employees={employees} departments={departments} positions={positions} job={job} />}
    </>
  );
}

function CandidateDialog({ c, onClose, canEdit, canHire, employees, departments, positions, job }: { c: Cand; onClose: () => void; canEdit: boolean; canHire: boolean; employees: Opt[]; departments: Opt[]; positions: Opt[]; job: { departmentId: string | null; positionId: string | null; branchId: string | null } }) {
  const { run, loading } = useAction();
  const [stage, setStage] = useState(c.stage);
  const [rating, setRating] = useState(c.rating ?? 0);
  const [notes, setNotes] = useState(c.notes ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [hireOpen, setHireOpen] = useState(false);
  const save = async () => {
    if ((await run(() => apiFetch(`/api/recruitment/candidates/${c.id}`, { method: "PATCH", body: { stage, rating: rating || null, notes: notes || null } }), "Đã cập nhật ứng viên")) !== undefined) onClose();
  };
  const genMsg = async (template: string) => {
    const r = await run(() => apiFetch<{ text: string }>(`/api/recruitment/candidates/${c.id}?template=${template}`), undefined, { refresh: false });
    if (r) setMsg(r.text);
  };
  return (
    <Dialog open onClose={onClose} title={c.fullName} description={`${CANDIDATE_STAGE[c.stage].label} · nộp ${fmtDate(new Date(c.createdAt))}${c.source ? ` · nguồn: ${c.source}` : ""}`} size="lg">
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap gap-4">
          {c.email && <span>✉ {c.email}</span>}
          {c.phone && <span>☎ {c.phone}</span>}
          {c.cvFileId && (
            <a href={`/api/files/${c.cvFileId}?inline=1`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Xem CV
            </a>
          )}
          {c.hiredEmployeeId && (
            <Link href={`/employees/${c.hiredEmployeeId}`} className="text-primary hover:underline">
              Hồ sơ nhân viên →
            </Link>
          )}
        </div>
        {canEdit && c.stage !== "HIRED" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Giai đoạn">
              <Select value={stage} onChange={(e) => setStage(e.target.value)}>
                {Object.entries(CANDIDATE_STAGE)
                  .filter(([k]) => k !== "HIRED")
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Đánh giá chung">
              <div className="flex h-9 items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setRating(n === rating ? 0 : n)} aria-label={`${n} sao`}>
                    <Star className={cn("size-5", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Ghi chú sàng lọc / nhận xét" className="sm:col-span-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
              {c.stage === "OFFER" && canHire && (
                <Button variant="secondary" onClick={() => setHireOpen(true)}>
                  <UserPlus /> Tiếp nhận làm nhân viên
                </Button>
              )}
              <Button loading={loading} onClick={save}>
                Lưu
              </Button>
            </div>
          </div>
        )}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">Phỏng vấn</p>
            {canEdit && c.stage !== "HIRED" && <ScheduleInterview candidateId={c.id} />}
          </div>
          {c.interviews.length === 0 && <p className="text-muted-foreground">Chưa có lịch phỏng vấn</p>}
          <div className="space-y-2">
            {c.interviews.map((i) => (
              <InterviewRow key={i.id} candidateId={c.id} iv={i} canEdit={canEdit} />
            ))}
          </div>
        </div>
        {canEdit && (
          <div>
            <p className="mb-2 font-semibold">Thông báo theo mẫu</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => genMsg("interviewInvite")}>
                Thư mời phỏng vấn
              </Button>
              <Button size="sm" variant="outline" onClick={() => genMsg("offer")}>
                Thư mời nhận việc
              </Button>
              <Button size="sm" variant="outline" onClick={() => genMsg("rejection")}>
                Thư cảm ơn
              </Button>
            </div>
            {msg && (
              <div className="mt-2 space-y-2">
                <Notice>Hệ thống chưa tích hợp gửi email – hãy sao chép nội dung và gửi qua kênh của công ty.</Notice>
                <Textarea value={msg} readOnly className="min-h-36" />
                <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(msg)}>
                  <Copy /> Sao chép
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      {hireOpen && <HireDialog candidateId={c.id} name={c.fullName} onClose={() => setHireOpen(false)} employees={employees} departments={departments} positions={positions} job={job} />}
    </Dialog>
  );
}

function ScheduleInterview({ candidateId }: { candidateId: string }) {
  const [open, setOpen] = useState(false);
  const { run, loading } = useAction();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Lên lịch
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Lên lịch phỏng vấn" size="sm">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const body = { scheduledAt: f.get("scheduledAt"), durationMin: Number(f.get("durationMin") || 60), location: f.get("location") || null, interviewers: f.get("interviewers") || null };
            if ((await run(() => apiFetch(`/api/recruitment/candidates/${candidateId}/interviews`, { body }), "Đã lên lịch phỏng vấn")) !== undefined) setOpen(false);
          }}
        >
          <Field label="Thời gian" required>
            <Input type="datetime-local" name="scheduledAt" required />
          </Field>
          <Field label="Thời lượng (phút)">
            <Input type="number" name="durationMin" defaultValue={60} min={15} />
          </Field>
          <Field label="Địa điểm / link họp">
            <Input name="location" />
          </Field>
          <Field label="Người phỏng vấn">
            <Input name="interviewers" />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={loading}>
              Lưu
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function InterviewRow({ candidateId, iv, canEdit }: { candidateId: string; iv: Interview; canEdit: boolean }) {
  const [edit, setEdit] = useState(false);
  const { run, loading } = useAction();
  const tone = iv.result === "PASS" ? "green" : iv.result === "FAIL" ? "red" : "slate";
  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {fmtDateTime(iv.scheduledAt)}
          {iv.location ? ` · ${iv.location}` : ""}
          {iv.interviewers ? ` · ${iv.interviewers}` : ""}
        </span>
        <span className="flex items-center gap-2">
          <Badge tone={tone}>{iv.result === "PASS" ? "Đạt" : iv.result === "FAIL" ? "Không đạt" : "Chờ kết quả"}</Badge>
          {iv.score !== null && <span className="text-xs">Điểm {iv.score}/10</span>}
          {canEdit && (
            <button className="text-xs text-primary hover:underline" onClick={() => setEdit((e) => !e)}>
              Ghi kết quả
            </button>
          )}
        </span>
      </div>
      {iv.notes && <p className="mt-1 whitespace-pre-line text-muted-foreground">{iv.notes}</p>}
      {edit && (
        <form
          className="mt-3 grid gap-2 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const body = { interviewId: iv.id, result: f.get("result"), score: f.get("score") ? Number(f.get("score")) : null, notes: f.get("notes") || null };
            if ((await run(() => apiFetch(`/api/recruitment/candidates/${candidateId}/interviews`, { method: "PATCH", body }), "Đã lưu kết quả")) !== undefined) setEdit(false);
          }}
        >
          <Select name="result" defaultValue={iv.result}>
            <option value="PENDING">Chờ kết quả</option>
            <option value="PASS">Đạt</option>
            <option value="FAIL">Không đạt</option>
          </Select>
          <Input name="score" type="number" min={0} max={10} placeholder="Điểm /10" defaultValue={iv.score ?? ""} />
          <Button type="submit" loading={loading}>
            Lưu
          </Button>
          <Textarea name="notes" placeholder="Ghi chú phỏng vấn" defaultValue={iv.notes ?? ""} className="sm:col-span-3" />
        </form>
      )}
    </div>
  );
}

function HireDialog({ candidateId, name, onClose, employees, departments, positions, job }: { candidateId: string; name: string; onClose: () => void; employees: Opt[]; departments: Opt[]; positions: Opt[]; job: { departmentId: string | null; positionId: string | null; branchId: string | null } }) {
  const { run, loading } = useAction();
  return (
    <Dialog open onClose={onClose} title={`Tiếp nhận ${name}`} description="Tạo hồ sơ nhân viên (thử việc) và checklist tiếp nhận. Có thể bổ sung thông tin cá nhân, hợp đồng, lương sau.">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const s = (k: string) => (f.get(k) as string) || null;
          const r = await run(() => apiFetch<{ employeeId: string }>(`/api/recruitment/candidates/${candidateId}/hire`, { body: { startDate: f.get("startDate"), departmentId: s("departmentId"), positionId: s("positionId"), managerId: s("managerId"), mentorId: s("mentorId"), probationDays: Number(f.get("probationDays") || 60) } }), "Đã tiếp nhận nhân viên mới");
          if (r) window.location.href = `/employees/${r.employeeId}`;
        }}
      >
        <Field label="Ngày nhận việc" required>
          <Input type="date" name="startDate" required />
        </Field>
        <Field label="Số ngày thử việc">
          <Input type="number" name="probationDays" defaultValue={60} min={0} max={180} />
        </Field>
        <Field label="Phòng ban">
          <Select name="departmentId" defaultValue={job.departmentId ?? ""}>
            <option value="">—</option>
            {departments.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Chức vụ">
          <Select name="positionId" defaultValue={job.positionId ?? ""}>
            <option value="">—</option>
            {positions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quản lý trực tiếp">
          <Select name="managerId" defaultValue="">
            <option value="">—</option>
            {employees.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Người hướng dẫn">
          <Select name="mentorId" defaultValue="">
            <option value="">—</option>
            {employees.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={loading}>
            Xác nhận tiếp nhận
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
