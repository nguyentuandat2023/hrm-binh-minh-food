import { NextResponse, type NextRequest } from "next/server";
import { runDailyJobs } from "@/lib/services/automation";
import { safeEqual } from "@/lib/crypto";

/** Dành cho cron bên ngoài: POST với header x-cron-secret = CRON_SECRET */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  if (secret.length < 16 || !safeEqual(given, secret)) return NextResponse.json({ error: "Không được phép" }, { status: 401 });
  const result = await runDailyJobs();
  return NextResponse.json({ ok: true, result });
}
