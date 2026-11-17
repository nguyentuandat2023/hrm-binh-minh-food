import { prisma, type Tx } from "./db";
import type { AuthCtx } from "./rbac";

const SENSITIVE = /password|passwordHash|bank|nationalId|salary|baseSalary|insuranceSalary|amount|totp|token|secret|dateOfBirth|address|emergency|netPay|gross|pit/i;

/** Che giá trị nhạy cảm: chỉ ghi nhận "đã thay đổi" chứ không ghi giá trị */
export function redact(changes: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
  if (!changes) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (SENSITIVE.test(k)) out[k] = "[đã thay đổi – ẩn]";
    else if (v instanceof Date) out[k] = v.toISOString();
    else if (v && typeof v === "object" && "from" in (v as object)) out[k] = v;
    else out[k] = v as unknown;
  }
  return out;
}

/** Tạo diff {field: {from, to}} giữa bản ghi cũ và mới (chỉ các trường được truyền vào) */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(after)) {
    const a = norm(before[k]);
    const b = norm(after[k]);
    if (a !== b) out[k] = SENSITIVE.test(k) ? { from: "[ẩn]", to: "[ẩn]" } : { from: before[k] ?? null, to: after[k] ?? null };
  }
  return out;
}
function norm(v: unknown) {
  if (v instanceof Date) return v.toISOString();
  if (v === undefined) return null;
  return JSON.stringify(v);
}

export interface AuditInput {
  action: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  changes?: Record<string, unknown>;
}

export async function audit(ctx: Pick<AuthCtx, "userId"> | null, input: AuditInput, req?: Request, tx: Tx = prisma) {
  await tx.auditLog.create({
    data: {
      userId: ctx?.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      summary: input.summary?.slice(0, 500),
      changes: (redact(input.changes) as object) ?? undefined,
      ip: req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req?.headers.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
}
