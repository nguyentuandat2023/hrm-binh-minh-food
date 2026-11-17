import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Kiểm tra "còn sống" cho nền tảng triển khai (không chạm cơ sở dữ liệu, không trả dữ liệu nghiệp vụ) */
export function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
