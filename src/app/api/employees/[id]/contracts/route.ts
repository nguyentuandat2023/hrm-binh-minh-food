import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { getEmployeeForCtx } from "@/lib/services/employee";
import { dbDate, isDateKey } from "@/lib/dates";
import { HttpError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { nextCode } from "@/lib/sequence";

const schema = z.object({
  type: z.enum(["PROBATION", "FIXED_TERM", "INDEFINITE", "SERVICE"]),
  code: z.string().trim().max(50).nullable().optional(),
  signedDate: z.string().refine(isDateKey).nullable().optional(),
  startDate: z.string().refine(isDateKey, "Nhập ngày bắt đầu"),
  endDate: z.string().refine(isDateKey).nullable().optional(),
  baseSalary: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
  documentId: z.string().nullable().optional(),
  previousId: z.string().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/** Tạo hợp đồng mới hoặc gia hạn (previousId = hợp đồng cũ → đánh dấu "Đã gia hạn") */
export const POST = api(async (req, { ctx, params }) => {
  const ref = await getEmployeeForCtx(ctx, params.id, "contract.create");
  const b = await parseBody(req, schema);
  if (b.type !== "INDEFINITE" && !b.endDate) throw new HttpError(400, "Hợp đồng có thời hạn cần ngày kết thúc");
  if (b.endDate && b.endDate < b.startDate) throw new HttpError(400, "Ngày kết thúc phải sau ngày bắt đầu");
  if (b.previousId) {
    const prev = await prisma.employmentContract.findFirst({ where: { id: b.previousId, employeeId: params.id } });
    if (!prev) throw new HttpError(400, "Hợp đồng gốc không hợp lệ");
    if (prev.status === "RENEWED") throw new HttpError(409, "Hợp đồng này đã được gia hạn");
  }
  const c = await prisma.$transaction(async (tx) => {
    const code = b.code || (await nextCode("contract", `HD-${b.startDate.slice(0, 4)}-`, 4, tx));
    if (b.previousId) await tx.employmentContract.update({ where: { id: b.previousId }, data: { status: "RENEWED" } });
    const created = await tx.employmentContract.create({
      data: {
        employeeId: params.id,
        code,
        type: b.type,
        signedDate: b.signedDate ? dbDate(b.signedDate) : null,
        startDate: dbDate(b.startDate),
        endDate: b.endDate ? dbDate(b.endDate) : null,
        baseSalary: ctx.perms["salary.view"] ? (b.baseSalary ?? null) : null,
        documentId: b.documentId ?? null,
        previousId: b.previousId ?? null,
        note: b.note ?? null,
      },
    });
    await audit(ctx, { action: "CREATE", entityType: "Employee", entityId: params.id, summary: `${b.previousId ? "Gia hạn" : "Tạo"} hợp đồng ${code} cho ${ref.fullName}` }, req, tx);
    return created;
  });
  return { id: c.id, code: c.code };
});
