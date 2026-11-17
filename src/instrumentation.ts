// Bộ lập lịch nội bộ (chỉ bật trên 1 instance qua ENABLE_INTERNAL_SCHEDULER=true).
// Production nhiều instance: tắt và gọi POST /api/cron/daily từ cron hệ thống với header x-cron-secret.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.ENABLE_INTERNAL_SCHEDULER !== "true") return;
  const g = globalThis as unknown as { __hrmScheduler?: boolean };
  if (g.__hrmScheduler) return;
  g.__hrmScheduler = true;
  const { runDailyJobs } = await import("./lib/services/automation");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runDailyJobs();
    } catch (e) {
      console.error("[scheduler] lỗi:", e instanceof Error ? e.message.slice(0, 200) : "unknown");
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 60_000);
  setInterval(tick, 30 * 60_000);
  console.log("[scheduler] Đã bật tác vụ tự động (30 phút/lần)");
}
