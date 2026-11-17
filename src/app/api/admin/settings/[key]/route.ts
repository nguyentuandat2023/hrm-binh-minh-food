import { api } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { saveSetting, settingSchemas, type SettingKey } from "@/lib/settings";
import { HttpError } from "@/lib/errors";
import { audit, diff } from "@/lib/audit";
import { getSetting } from "@/lib/settings";

export const PUT = api(async (req, { ctx, params }) => {
  const key = params.key as SettingKey;
  if (!(key in settingSchemas)) throw new HttpError(404, "Nhóm cấu hình không tồn tại");
  // Chính sách nghỉ phép: HR (leave.update) được sửa; nhóm khác cần quyền cấu hình hệ thống
  requirePerm(ctx, key === "leave" ? "leave.update" : "admin_setting.update", "COMPANY");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, "Nội dung không hợp lệ");
  }
  const before = await getSetting(key);
  const saved = await saveSetting(key, body, ctx.userId);
  await audit(ctx, { action: "SETTINGS_CHANGED", entityType: "Setting", entityId: key, summary: `Cập nhật cấu hình "${key}"`, changes: diff(before as never, saved as never) }, req);
  return { ok: true, value: saved };
});
