import { api } from "@/lib/api";
import { cancelLeave } from "@/lib/services/leave";

export const POST = api(async (req, { ctx, params }) => {
  await cancelLeave(ctx, params.id, req);
  return { ok: true };
});
