"use client";
import { useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { apiFetch, useAction } from "@/lib/client";
import type { PayrollParams } from "@/lib/payroll-calc";
import { fmtVND } from "@/lib/format";

const pct = (n: number) => Math.round(n * 10000) / 100;

export function ConfigEditor({ id, name, effectiveFrom, params, readOnly }: { id: string; name: string; effectiveFrom: string; params: PayrollParams; readOnly: boolean }) {
  const [p, setP] = useState<PayrollParams>(params);
  const [meta, setMeta] = useState({ name, effectiveFrom });
  const { run, loading } = useAction();
  const num = (v: string) => (v === "" ? 0 : Number(v));
  const setIns = (who: "employee" | "employer", k: "bhxh" | "bhyt" | "bhtn", v: string) => setP((s) => ({ ...s, insurance: { ...s.insurance, [who]: { ...s.insurance[who], [k]: num(v) / 100 } } }));
  return (
    <div className="space-y-5 text-sm">
      {!readOnly && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tên phiên bản">
            <Input value={meta.name} onChange={(e) => setMeta((s) => ({ ...s, name: e.target.value }))} />
          </Field>
          <Field label="Hiệu lực từ">
            <Input type="date" value={meta.effectiveFrom} onChange={(e) => setMeta((s) => ({ ...s, effectiveFrom: e.target.value }))} />
          </Field>
        </div>
      )}
      <fieldset disabled={readOnly} className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="font-semibold">Bảo hiểm bắt buộc (%)</p>
          <div className="grid grid-cols-4 items-center gap-2 text-xs">
            <span />
            <span className="font-medium">BHXH</span>
            <span className="font-medium">BHYT</span>
            <span className="font-medium">BHTN</span>
            {(["employee", "employer"] as const).map((who) => (
              <FragmentRow key={who} label={who === "employee" ? "Người lao động" : "Doanh nghiệp"}>
                {(["bhxh", "bhyt", "bhtn"] as const).map((k) => (
                  <Input key={k} type="number" step={0.01} min={0} max={100} value={pct(p.insurance[who][k])} onChange={(e) => setIns(who, k, e.target.value)} aria-label={`${who} ${k}`} />
                ))}
              </FragmentRow>
            ))}
          </div>
          <Field label="Trần lương đóng BHXH, BHYT (VND)" hint={fmtVND(p.insurance.capSocialHealth)}>
            <Input type="number" step={1000} value={p.insurance.capSocialHealth} onChange={(e) => setP((s) => ({ ...s, insurance: { ...s.insurance, capSocialHealth: num(e.target.value) } }))} />
          </Field>
          <Field label="Trần lương đóng BHTN (VND)" hint={fmtVND(p.insurance.capUnemployment)}>
            <Input type="number" step={1000} value={p.insurance.capUnemployment} onChange={(e) => setP((s) => ({ ...s, insurance: { ...s.insurance, capUnemployment: num(e.target.value) } }))} />
          </Field>
          <Field label="Không đóng BH khi nghỉ không lương từ (ngày/tháng)">
            <Input type="number" min={0} max={31} value={p.insurance.skipIfUnpaidDaysAtLeast} onChange={(e) => setP((s) => ({ ...s, insurance: { ...s.insurance, skipIfUnpaidDaysAtLeast: num(e.target.value) } }))} />
          </Field>
        </div>
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="font-semibold">Thuế thu nhập cá nhân</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Giảm trừ bản thân (VND/tháng)" hint={fmtVND(p.pit.personalDeduction)}>
              <Input type="number" step={1000} value={p.pit.personalDeduction} onChange={(e) => setP((s) => ({ ...s, pit: { ...s.pit, personalDeduction: num(e.target.value) } }))} />
            </Field>
            <Field label="Giảm trừ mỗi người phụ thuộc" hint={fmtVND(p.pit.dependentDeduction)}>
              <Input type="number" step={1000} value={p.pit.dependentDeduction} onChange={(e) => setP((s) => ({ ...s, pit: { ...s.pit, dependentDeduction: num(e.target.value) } }))} />
            </Field>
          </div>
          <p className="text-xs font-medium">Biểu thuế luỹ tiến (thu nhập tính thuế/tháng)</p>
          {p.pit.brackets.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-12 text-xs text-muted-foreground">Bậc {i + 1}</span>
              <Input
                type="number"
                step={1000}
                placeholder="Không giới hạn"
                value={b.upTo ?? ""}
                disabled={readOnly || i === p.pit.brackets.length - 1}
                onChange={(e) => setP((s) => ({ ...s, pit: { ...s.pit, brackets: s.pit.brackets.map((x, j) => (j === i ? { ...x, upTo: e.target.value === "" ? null : num(e.target.value) } : x)) } }))}
                aria-label={`Ngưỡng bậc ${i + 1}`}
              />
              <Input type="number" step={0.5} className="w-24" value={pct(b.rate)} onChange={(e) => setP((s) => ({ ...s, pit: { ...s.pit, brackets: s.pit.brackets.map((x, j) => (j === i ? { ...x, rate: num(e.target.value) / 100 } : x)) } }))} aria-label={`Thuế suất bậc ${i + 1}`} />
              <span className="text-xs">%</span>
              {!readOnly && p.pit.brackets.length > 1 && (
                <button type="button" onClick={() => setP((s) => ({ ...s, pit: { ...s.pit, brackets: s.pit.brackets.filter((_, j) => j !== i).map((x, j, arr) => (j === arr.length - 1 ? { ...x, upTo: null } : x)) } }))} aria-label="Xoá bậc">
                  <Trash2 className="size-4 text-rose-600" />
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setP((s) => {
                  const br = [...s.pit.brackets];
                  const last = br[br.length - 1];
                  const prevUp = br.length > 1 ? (br[br.length - 2].upTo ?? 0) : 0;
                  br[br.length - 1] = { ...last, upTo: prevUp + 10_000_000 };
                  br.push({ upTo: null, rate: last.rate });
                  return { ...s, pit: { ...s.pit, brackets: br } };
                })
              }
            >
              <Plus /> Thêm bậc
            </Button>
          )}
          <Checkbox checked={p.pit.overtimePremiumExempt} onChange={(e) => setP((s) => ({ ...s, pit: { ...s.pit, overtimePremiumExempt: e.target.checked } }))} label="Phần tiền tăng ca cao hơn lương giờ bình thường được miễn thuế" />
        </div>
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="font-semibold">Tăng ca & ngày công</p>
          <div className="grid grid-cols-3 gap-2">
            {(["weekday", "weekend", "holiday"] as const).map((k) => (
              <Field key={k} label={{ weekday: "Ngày thường", weekend: "Nghỉ tuần", holiday: "Ngày lễ" }[k] + " (×)"}>
                <Input type="number" step={0.1} min={1} max={5} value={p.overtime[k]} onChange={(e) => setP((s) => ({ ...s, overtime: { ...s.overtime, [k]: num(e.target.value) } }))} />
              </Field>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Giờ/ngày">
              <Input type="number" min={1} max={24} value={p.hoursPerDay} onChange={(e) => setP((s) => ({ ...s, hoursPerDay: num(e.target.value) }))} />
            </Field>
            <Field label="Công chuẩn">
              <Select value={p.standardWorkdaysMode} onChange={(e) => setP((s) => ({ ...s, standardWorkdaysMode: e.target.value as "SCHEDULED" | "FIXED" }))}>
                <option value="SCHEDULED">Theo lịch làm việc</option>
                <option value="FIXED">Cố định</option>
              </Select>
            </Field>
            <Field label="Số công cố định">
              <Input type="number" min={1} max={31} value={p.fixedStandardWorkdays} disabled={readOnly || p.standardWorkdaysMode !== "FIXED"} onChange={(e) => setP((s) => ({ ...s, fixedStandardWorkdays: num(e.target.value) }))} />
            </Field>
          </div>
        </div>
      </fieldset>
      {!readOnly && (
        <div className="flex justify-end">
          <Button loading={loading} onClick={() => run(() => apiFetch(`/api/payroll/configs/${id}`, { method: "PATCH", body: { action: "update", name: meta.name, effectiveFrom: meta.effectiveFrom, params: p } }), "Đã lưu bản nháp")}>
            Lưu bản nháp
          </Button>
        </div>
      )}
    </div>
  );
}

function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span>{label}</span>
      {children}
    </>
  );
}

export function ActivateButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const { run, loading } = useAction();
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <ShieldCheck /> Xác minh & kích hoạt
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Xác minh cấu hình lương"
        description="Hệ thống sẽ chạy thử công thức với hồ sơ mẫu trước khi kích hoạt."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={note.trim().length < 20}
              loading={loading}
              onClick={async () => {
                const r = await run(() => apiFetch<{ probe: { gross: number; net: number; pit: number; insurance: number } }>(`/api/payroll/configs/${id}`, { method: "PATCH", body: { action: "activate", verifiedNote: note } }), "Đã kích hoạt cấu hình");
                if (r) setOpen(false);
              }}
            >
              Tôi đã kiểm tra – kích hoạt
            </Button>
          </>
        }
      >
        <Field label="Căn cứ pháp lý & người kiểm tra (bắt buộc)" hint="VD: Đối chiếu Luật Thuế TNCN, Nghị quyết giảm trừ gia cảnh, Nghị định lương tối thiểu vùng hiện hành… – kiểm tra bởi Kế toán trưởng ngày …">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-32" />
        </Field>
      </Dialog>
    </>
  );
}
