import { z } from "zod";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { setEmployeeActive } from "@/lib/services/employee";

const schema = z.object({ active: z.boolean(), reason: z.string().trim().min(3, "Nhập lý do").max(500) });

/** Ngừng kích hoạt / kích hoạt lại hồ sơ (không xoá dữ liệu) */
export const POST = api(async (req, { ctx, params }) => {
  requirePerm(ctx, "employee.delete");
  const { active, reason } = await parseBody(req, schema);
  await setEmployeeActive(ctx, params.id, active, reason, req);
  return { ok: true };
});
