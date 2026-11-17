import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";
import { getEmployeeDetail } from "@/lib/services/employee";
import { HttpError } from "@/lib/errors";
import { orgOptions } from "@/lib/options";
import { fmtDate, fmtDateTime, fmtVND } from "@/lib/format";
import { CONTRACT_STATUS, CONTRACT_TYPE, DOC_CATEGORY, EMPLOYEE_STATUS, EMPLOYMENT_TYPE, GENDER, PAY_TYPE } from "@/lib/labels";
import { mask } from "@/lib/crypto";
import { spGet, type SP } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, InfoRow, Notice, PageHeader, Tabs } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  AllowanceAdd,
  AllowanceDelete,
  AvatarUpload,
  ContractDialogButton,
  ContractStatusButton,
  DocumentActions,
  DocumentUpload,
  EditPrivateButton,
  EditWorkButton,
  RevealText,
  SalaryEditButton,
  StatusButton,
} from "./detail-client";

export default async function EmployeeDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const ctx = await requirePageAuth();
  const { id } = await params;
  const sp = await searchParams;
  let d: Awaited<ReturnType<typeof getEmployeeDetail>>;
  try {
    d = await getEmployeeDetail(ctx, id);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    if (e instanceof HttpError && e.status === 403) redirect("/forbidden");
    throw e;
  }
  const w = d.work;
  const tab = spGet(sp, "tab") ?? "overview";
  const tabs = [
    { key: "overview", label: "Tổng quan", href: `?tab=overview` },
    ...(d.contracts ? [{ key: "contracts", label: `Hợp đồng (${d.contracts.length})`, href: `?tab=contracts` }] : []),
    ...(d.salary ? [{ key: "salary", label: "Lương & phụ cấp", href: `?tab=salary` }] : []),
    ...(d.documents ? [{ key: "documents", label: `Tài liệu (${d.documents.length})`, href: `?tab=documents` }] : []),
    ...(d.history ? [{ key: "history", label: "Lịch sử thay đổi", href: `?tab=history` }] : []),
  ];
  const options = d.allow.edit ? await orgOptions() : null;
  const st = EMPLOYEE_STATUS[w.status];

  return (
    <div>
      <PageHeader back={{ href: "/employees", label: "Nhân viên" }} title="Hồ sơ nhân viên" />
      <Card className="mb-5">
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <Avatar name={w.fullName} fileId={w.avatarFileId} size={72} />
            {(d.allow.uploadDocs || ctx.employee?.id === id) && <AvatarUpload id={id} />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">{w.fullName}</h2>
            <p className="text-sm text-muted-foreground">
              {w.code} · {w.position?.name ?? "Chưa có chức vụ"} · {w.department?.name ?? "Chưa phân phòng ban"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {w.deactivatedAt ? <Badge tone="slate">Ngừng kích hoạt từ {fmtDate(new Date(w.deactivatedAt))}</Badge> : <Badge tone={st.tone}>{st.label}</Badge>}
              <Badge>{EMPLOYMENT_TYPE[w.employmentType]}</Badge>
              {w.hasAccount ? <Badge tone={w.accountActive ? "primary" : "red"}>{w.accountActive ? "Có tài khoản" : "Tài khoản bị khoá"}</Badge> : <Badge tone="slate">Chưa có tài khoản</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {d.allow.edit && options && <EditWorkButton id={id} work={w as never} options={options} />}
            {d.allow.deactivate && <StatusButton id={id} active={!w.deactivatedAt} name={w.fullName} />}
          </div>
        </CardContent>
      </Card>

      <Tabs items={tabs} active={tab} />

      {tab === "overview" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Thông tin công việc" />
            <CardContent>
              <dl>
                <InfoRow label="Mã nhân viên">{w.code}</InfoRow>
                <InfoRow label="Phòng ban">{w.department?.name}</InfoRow>
                <InfoRow label="Chức vụ">{w.position?.name}</InfoRow>
                <InfoRow label="Chi nhánh">{w.branch?.name}</InfoRow>
                <InfoRow label="Quản lý trực tiếp">{w.manager ? <Link className="text-primary hover:underline" href={`/employees/${w.manager.id}`}>{w.manager.fullName}</Link> : null}</InfoRow>
                <InfoRow label="Ngày bắt đầu">{fmtDate(w.startDate)}</InfoRow>
                <InfoRow label="Hết thử việc">{fmtDate(w.probationEndDate)}</InfoRow>
                {w.endDate && <InfoRow label="Ngày nghỉ việc">{fmtDate(w.endDate)}</InfoRow>}
                <InfoRow label="Email">{w.email}</InfoRow>
                <InfoRow label="Điện thoại">{w.phone}</InfoRow>
              </dl>
              {w.reports.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm font-medium">Nhân viên trực tiếp quản lý ({w.reports.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {w.reports.map((r) => (
                      <Link key={r.id} href={`/employees/${r.id}`} className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 text-sm hover:bg-muted">
                        <Avatar name={r.fullName} fileId={r.avatarFileId} size={24} /> {r.fullName}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Thông tin cá nhân" description={d.private ? "Dữ liệu nhạy cảm – truy cập được ghi nhận" : undefined} actions={d.private && d.allow.editPrivate ? <EditPrivateButton id={id} data={d.private as never} /> : undefined} />
            <CardContent>
              {d.private ? (
                <dl>
                  <InfoRow label="Ngày sinh">{fmtDate(d.private.dateOfBirth)}</InfoRow>
                  <InfoRow label="Giới tính">{GENDER[d.private.gender]}</InfoRow>
                  <InfoRow label="Số CCCD">{d.private.nationalId ? <RevealText masked={mask(d.private.nationalId)} full={d.private.nationalId} /> : null}</InfoRow>
                  <InfoRow label="Địa chỉ">{d.private.address}</InfoRow>
                  <InfoRow label="Liên hệ khẩn cấp">{[d.private.emergencyName, d.private.emergencyRelation, d.private.emergencyPhone].filter(Boolean).join(" · ")}</InfoRow>
                </dl>
              ) : (
                <Notice>Bạn không có quyền xem thông tin cá nhân của nhân viên này.</Notice>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "contracts" && d.contracts && (
        <Card>
          <CardHeader title="Hợp đồng lao động" description="Lịch sử ký và gia hạn" actions={d.allow.manageContracts ? <ContractDialogButton employeeId={id} canSalary={!!ctx.perms["salary.view"]} /> : undefined} />
          {d.contracts.length === 0 ? (
            <EmptyState title="Chưa có hợp đồng" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Số HĐ</TH>
                  <TH>Loại</TH>
                  <TH>Hiệu lực</TH>
                  {d.salary && <TH className="text-right">Mức lương</TH>}
                  <TH>Trạng thái</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {d.contracts.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.code}</TD>
                    <TD>{CONTRACT_TYPE[c.type]}</TD>
                    <TD className="tabular">
                      {fmtDate(c.startDate)} → {c.endDate ? fmtDate(c.endDate) : "Không thời hạn"}
                    </TD>
                    {d.salary && <TD className="tabular text-right">{c.baseSalary ? fmtVND(c.baseSalary) : "—"}</TD>}
                    <TD>
                      <Badge tone={CONTRACT_STATUS[c.status].tone}>{CONTRACT_STATUS[c.status].label}</Badge>
                    </TD>
                    <TD className="text-right">
                      {d.allow.manageContracts && c.status === "ACTIVE" && (
                        <div className="flex justify-end">
                          <ContractDialogButton employeeId={id} previous={{ id: c.id, type: c.type, endDate: c.endDate, baseSalary: c.baseSalary }} canSalary={!!ctx.perms["salary.view"]} />
                          <ContractStatusButton id={c.id} code={c.code} />
                        </div>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "salary" && d.salary && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Thông tin lương" description="Dữ liệu bảo mật – chỉ người có quyền xem lương" actions={d.allow.editSalary ? <SalaryEditButton employeeId={id} profile={d.salary.profile} /> : undefined} />
            <CardContent>
              {d.salary.profile ? (
                <dl>
                  <InfoRow label="Hình thức trả lương">{PAY_TYPE[d.salary.profile.payType]}</InfoRow>
                  <InfoRow label="Lương cơ bản">{fmtVND(d.salary.profile.baseSalary)}</InfoRow>
                  <InfoRow label="Lương đóng BHXH">{d.salary.profile.insuranceSalary ? fmtVND(d.salary.profile.insuranceSalary) : "Theo lương cơ bản"}</InfoRow>
                  <InfoRow label="Người phụ thuộc">{String(d.salary.profile.dependents)}</InfoRow>
                  <InfoRow label="Ngân hàng">{d.salary.profile.bankName}</InfoRow>
                  <InfoRow label="Số tài khoản">{d.salary.profile.bankAccount ? <RevealText masked={d.salary.profile.bankAccountMasked} full={d.salary.profile.bankAccount} /> : null}</InfoRow>
                  <InfoRow label="Chủ tài khoản">{d.salary.profile.bankAccountName}</InfoRow>
                </dl>
              ) : (
                <EmptyState title="Chưa thiết lập thông tin lương" />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Phụ cấp cố định" actions={d.allow.editSalary ? <AllowanceAdd employeeId={id} /> : undefined} />
            <CardContent className="space-y-2">
              {d.salary.allowances.length === 0 && <p className="text-sm text-muted-foreground">Không có phụ cấp</p>}
              {d.salary.allowances.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                  <span>
                    {a.name} {!a.taxable && <Badge tone="slate">Không chịu thuế</Badge>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular font-medium">{fmtVND(a.amount)}</span>
                    {d.allow.editSalary && <AllowanceDelete employeeId={id} allowanceId={a.id} name={a.name} />}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Lịch sử điều chỉnh lương" />
            {d.salary.adjustments.length === 0 ? (
              <EmptyState title="Chưa có điều chỉnh" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Ngày hiệu lực</TH>
                    <TH className="text-right">Lương cũ</TH>
                    <TH className="text-right">Lương mới</TH>
                    <TH>Lý do</TH>
                  </tr>
                </THead>
                <TBody>
                  {d.salary.adjustments.map((a) => (
                    <TR key={a.id}>
                      <TD>{fmtDate(a.effectiveDate)}</TD>
                      <TD className="tabular text-right">{fmtVND(a.oldSalary)}</TD>
                      <TD className="tabular text-right">{fmtVND(a.newSalary)}</TD>
                      <TD>{a.reason}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {tab === "documents" && d.documents && (
        <Card>
          <CardHeader title="Tài liệu đính kèm" actions={d.allow.uploadDocs ? <DocumentUpload employeeId={id} /> : undefined} />
          {d.documents.length === 0 ? (
            <EmptyState title="Chưa có tài liệu" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Tên file</TH>
                  <TH>Loại</TH>
                  <TH className="hidden sm:table-cell">Dung lượng</TH>
                  <TH className="hidden sm:table-cell">Ngày tải lên</TH>
                  <TH />
                </tr>
              </THead>
              <TBody>
                {d.documents.map((doc) => (
                  <TR key={doc.id}>
                    <TD className="max-w-64 truncate font-medium">{doc.fileName}</TD>
                    <TD>{DOC_CATEGORY[doc.category]}</TD>
                    <TD className="hidden tabular sm:table-cell">{(doc.size / 1024).toFixed(0)} KB</TD>
                    <TD className="hidden sm:table-cell">{fmtDateTime(doc.createdAt)}</TD>
                    <TD>
                      <DocumentActions id={doc.id} name={doc.fileName} canDelete={d.allow.deleteDocs} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}

      {tab === "history" && d.history && (
        <Card>
          <CardHeader title="Lịch sử thay đổi thông tin" description="Giá trị nhạy cảm (lương, CCCD, tài khoản…) chỉ ghi nhận là đã thay đổi" />
          {d.history.length === 0 ? (
            <EmptyState title="Chưa có thay đổi" />
          ) : (
            <ul className="divide-y divide-border">
              {d.history.map((h) => (
                <li key={h.id} className="px-5 py-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{h.summary ?? h.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {fmtDateTime(h.createdAt)} · {h.user?.email ?? "hệ thống"}
                    </span>
                  </div>
                  {h.changes && typeof h.changes === "object" && (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                      {Object.entries(h.changes as Record<string, { from?: unknown; to?: unknown } | string>).map(([k, v]) => (
                        <li key={k}>
                          <code>{k}</code>: {typeof v === "object" && v ? `${String(v.from ?? "∅")} → ${String(v.to ?? "∅")}` : String(v)}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
