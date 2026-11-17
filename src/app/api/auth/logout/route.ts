import { publicApi } from "@/lib/api";
import { destroyCurrentSession, getSessionState } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const POST = publicApi(async (req) => {
  const state = await getSessionState();
  if (state.status === "ok") await audit({ userId: state.ctx.userId }, { action: "LOGOUT", entityType: "User", entityId: state.ctx.userId }, req);
  await destroyCurrentSession();
  return { ok: true };
});
