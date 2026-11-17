"use client";
import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { apiFetch, useAction } from "@/lib/client";

type LeaveTypeOpt = { id: string; name: string; requiresAttachment: boolean; deductsBalance: boolean; isPaid: boolean };

export function LeaveRequestDialog({ types, employees, label = "Tạo đơn nghỉ" }: { types: LeaveTypeOpt[]; employees?: { value: string; label: string }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ employeeId: "", leaveTypeId: types[0]?.id ?? "", startDate: "", endDate: "", halfDay: "NONE", reason: "" });
  const [preview, setPreview] = useState<{ days: number; available: number | null; error?: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const { run, loading, fieldErrors } = useAction();
  const type = types.find((t) => t.id === v.leaveTypeId);
  const single = v.startDate && (v.startDate === v.endDate || !v.endDate);

  useEffect(() => {
    if (!open || !v.startDate) return setPreview(null);
    const end = v.endDate || v.startDate;
    const ctrl = new AbortController();
    const q = new URLSearchParams({ start: v.startDate, end, halfDay: single ? v.halfDay : "NONE", type: v.leaveTypeId, ...(v.employeeId ? { employeeId: v.employeeId } : {}) });
    fetch(`/api/leave/requests?${q}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => setPreview(d))
      .catch(() => {});
    return () => ctrl.abort();
  }, [open, v.startDate, v.endDate, v.halfDay, v.leaveTypeId, v.employeeId, single]);

  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  const insufficient = preview && preview.available !== null && preview.days > preview.available;

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <CalendarPlus /> {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Đơn xin nghỉ"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button
              loading={loading}
              disabled={!v.startDate || !v.reason || (type?.requiresAttachment && !file) || !preview?.days}
              onClick={async () => {
                const r = await run(async () => {
                  let attachmentId: string | null = null;
                  if (file) {
                    const form = new FormData();
                    form.set("file", file);
                    form.set("category", "LEAVE_ATTACHMENT");
                    attachmentId = (await apiFetch<{ id: string }>("/api/me/upload", { form })).id;
                  }
                  return apiFetch("/api/leave/requests", {
                    body: { ...v, employeeId: v.employeeId || undefined, endDate: v.endDate || v.startDate, halfDay: single ? v.halfDay : "NONE", attachmentId },
                  });
                }, "Đã gửi đơn nghỉ – đang chờ duyệt");
                if (r !== undefined) {
                  setOpen(false);
                  setV((s) => ({ ...s, startDate: "", endDate: "", reason: "", halfDay: "NONE" }));
                  setFile(null);
                }
              }}
            >
              Gửi đơn
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {employees && (
            <Field label="Nhân viên (HR tạo đơn thay)" className="sm:col-span-2">
              <Select value={v.employeeId} onChange={set("employeeId")}>
                <option value="">— Chính tôi —</option>
                {employees.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Loại nghỉ" required className="sm:col-span-2" error={fieldErrors.leaveTypeId}>
            <Select value={v.leaveTypeId} onChange={set("leaveTypeId")}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isPaid ? "" : " (không hưởng lương từ công ty)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Từ ngày" required error={fieldErrors.startDate}>
            <Input type="date" value={v.startDate} onChange={set("startDate")} />
          </Field>
          <Field label="Đến ngày" hint="Để trống nếu nghỉ 1 ngày" error={fieldErrors.endDate}>
            <Input type="date" value={v.endDate} min={v.startDate || undefined} onChange={set("endDate")} />
          </Field>
          {single && (
            <Field label="Thời gian nghỉ" className="sm:col-span-2">
              <Select value={v.halfDay} onChange={set("halfDay")}>
                <option value="NONE">Cả ngày</option>
                <option value="MORNING">Nửa ngày – buổi sáng</option>
                <option value="AFTERNOON">Nửa ngày – buổi chiều</option>
              </Select>
            </Field>
          )}
          <Field label="Lý do" required className="sm:col-span-2" error={fieldErrors.reason}>
            <Textarea value={v.reason} onChange={set("reason")} maxLength={1000} />
          </Field>
          <Field label={`Tài liệu đính kèm${type?.requiresAttachment ? " (bắt buộc)" : ""}`} className="sm:col-span-2" hint="Giấy khám bệnh, giấy tờ liên quan – PDF/ảnh, tối đa 10MB">
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2" />
          </Field>
          {preview && (
            <div className="sm:col-span-2">
              {preview.error ? (
                <Notice tone="warning">{preview.error}</Notice>
              ) : (
                <Notice tone={insufficient ? "danger" : "info"}>
                  Số ngày nghỉ tính công: <b>{preview.days}</b> ngày (đã trừ ngày nghỉ tuần, ngày lễ)
                  {preview.available !== null && (
                    <>
                      {" "}
                      · Phép còn lại: <b>{preview.available}</b> ngày{insufficient ? " – không đủ" : ""}
                    </>
                  )}
                </Notice>
              )}
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
