// Chặn sớm các route khi chưa có cookie phiên. Việc xác thực đầy đủ (DB, quyền) thực hiện ở server.
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/api/auth/login", "/api/auth/mfa/verify", "/api/cron", "/api/health", "/api/logo"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (req.cookies.get("hrm_session")) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Phiên đăng nhập đã hết hạn", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + req.nextUrl.search)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
