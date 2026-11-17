import { api } from "@/lib/api";
import { getEmployeeDetail, updateEmployee } from "@/lib/services/employee";
import { HttpError } from "@/lib/errors";

export const GET = api(async (_req, { ctx, params }) => {
  const d = await getEmployeeDetail(ctx, params.id);
  // Không trả lịch sử thay đổi qua API chi tiết để giảm dữ liệu thừa
  return { ...d, history: undefined };
});

export const PATCH = api(async (req, { ctx, params }) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Nội dung không hợp lệ");
  }
  const e = await updateEmployee(ctx, params.id, body, req);
  return { id: e.id };
});
