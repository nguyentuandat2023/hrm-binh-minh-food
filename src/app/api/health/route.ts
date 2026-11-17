import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** Kiểm tra sức khoẻ cho Docker/load balancer – không trả dữ liệu nghiệp vụ */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "db_unavailable" }, { status: 503 });
  }
}
