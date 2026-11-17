import { api } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { runDailyJobs } from "@/lib/services/automation";

/** Chạy ngay các tác vụ tự động (an toàn khi chạy lặp lại) */
export const POST = api(async (_req, { ctx }) => {
  requirePerm(ctx, "admin_setting.update", "COMPANY");
  return { ok: true, result: await runDailyJobs(new Date(), ctx.userId) };
});
