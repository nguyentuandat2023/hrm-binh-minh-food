"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { apiFetch, useAction } from "@/lib/client";

export function DecideButtons({ id }: { id: string }) {
  const [mode, setMode] = useState<"APPROVED" | "REJECTED" | null>(null);
  const [comment, setComment] = useState("");
  const { run, loading } = useAction();
  const submit = async () => {
    const ok = await run(() => apiFetch(`/api/approvals/${id}`, { body: { decision: mode, comment: comment || undefined } }), mode === "APPROVED" ? "Đã duyệt" : "Đã từ chối");
    if (ok !== undefined) setMode(null);
  };
  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => (setComment(""), setMode("APPROVED"))}>
        <Check /> Duyệt
      </Button>
      <Button size="sm" variant="outline" className="text-rose-600" onClick={() => (setComment(""), setMode("REJECTED"))}>
        <X /> Từ chối
      </Button>
      <Dialog
        open={!!mode}
        onClose={() => setMode(null)}
        title={mode === "APPROVED" ? "Xác nhận duyệt" : "Từ chối yêu cầu"}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setMode(null)}>
              Huỷ
            </Button>
            <Button variant={mode === "REJECTED" ? "destructive" : "default"} loading={loading} disabled={mode === "REJECTED" && comment.trim().length < 3} onClick={submit}>
              {mode === "APPROVED" ? "Duyệt" : "Từ chối"}
            </Button>
          </>
        }
      >
        <Field label={mode === "REJECTED" ? "Lý do từ chối (bắt buộc)" : "Ý kiến (không bắt buộc)"}>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} autoFocus />
        </Field>
      </Dialog>
    </div>
  );
}
