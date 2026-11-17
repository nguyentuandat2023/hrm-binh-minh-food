"use client";
import { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { apiFetch, useAction } from "@/lib/client";

export function TaskToggle({ checklistId, taskId, done, disabled }: { checklistId: string; taskId: string; done: boolean; disabled: boolean }) {
  const { run, loading } = useAction();
  return (
    <button
      disabled={disabled || loading}
      onClick={() => run(() => apiFetch(`/api/lifecycle/${checklistId}`, { body: { action: "toggle_task", taskId, done: !done } }))}
      aria-label={done ? "Bỏ hoàn thành" : "Đánh dấu hoàn thành"}
      className="disabled:opacity-50"
    >
      {done ? <CheckCircle2 className="size-6 text-emerald-600" /> : <Circle className="size-6 text-muted-foreground" />}
    </button>
  );
}

export function CompleteChecklist({ id, type, pending, assetsHeld, isProbation, accountActive }: { id: string; type: string; pending: number; assetsHeld: number; isProbation: boolean; accountActive: boolean }) {
  const [open, setOpen] = useState(false);
  const [opt, setOpt] = useState({ applyResignation: false, lockAccount: false, confirmProbationPassed: false });
  const { run, loading } = useAction();
  const off = type === "OFFBOARDING";
  const blocked = pending > 0 || (off && assetsHeld > 0);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Hoàn tất</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={off ? "Hoàn tất thủ tục nghỉ việc" : "Hoàn tất tiếp nhận"}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button disabled={blocked} loading={loading} onClick={async () => (await run(() => apiFetch(`/api/lifecycle/${id}`, { body: { action: "complete", ...opt } }), "Đã hoàn tất")) !== undefined && setOpen(false)}>
              Xác nhận hoàn tất
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          {pending > 0 && <Notice tone="warning">Còn {pending} đầu việc chưa hoàn thành.</Notice>}
          {off && assetsHeld > 0 && <Notice tone="warning">Nhân viên còn giữ {assetsHeld} tài sản.</Notice>}
          <p className="text-muted-foreground">Các thay đổi dưới đây chỉ thực hiện khi bạn chọn – hệ thống không tự ra quyết định nhân sự.</p>
          {off ? (
            <>
              <Checkbox label="Chuyển trạng thái nhân viên thành “Đã nghỉ việc” và chấm dứt hợp đồng đang hiệu lực" checked={opt.applyResignation} onChange={(e) => setOpt((s) => ({ ...s, applyResignation: e.target.checked }))} className="flex" />
              {accountActive && <Checkbox label="Khoá tài khoản HRM và thu hồi mọi phiên đăng nhập" checked={opt.lockAccount} onChange={(e) => setOpt((s) => ({ ...s, lockAccount: e.target.checked }))} className="flex" />}
            </>
          ) : (
            isProbation && <Checkbox label="Xác nhận nhân viên đạt thử việc → chuyển trạng thái “Đang làm việc”" checked={opt.confirmProbationPassed} onChange={(e) => setOpt((s) => ({ ...s, confirmProbationPassed: e.target.checked }))} className="flex" />
          )}
        </div>
      </Dialog>
    </>
  );
}
