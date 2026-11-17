import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { getSessionState, mfaRequiredButMissing } from "./auth";
import { HttpError } from "./errors";
import { appOrigin } from "./app-url";
import type { AuthCtx } from "./rbac";

type Params = Record<string, string>;
interface Options {
  /** cho phép khi user đang bị buộc đổi mật khẩu / thiết lập MFA */
  allowRestricted?: boolean;
}
type Handler = (req: NextRequest, a: { ctx: AuthCtx; params: Params }) => Promise<Response | unknown>;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Chống CSRF: yêu cầu thay đổi dữ liệu phải đến từ cùng origin (kết hợp cookie SameSite=Lax) */
export function checkOrigin(req: NextRequest): boolean {
  if (SAFE_METHODS.has(req.method)) return true;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const allowed = new Set<string>();
  const configured = appOrigin();
  if (configured) allowed.add(configured);
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  if (origin) return allowed.has(origin);
  return req.headers.get("sec-fetch-site") === "same-origin";
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) {
    return NextResponse.json({ error: e.message, code: e.code, details: e.details }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of e.issues) fields[issue.path.join(".") || "_"] ??= issue.message;
    return NextResponse.json({ error: "Dữ liệu không hợp lệ", code: "VALIDATION", fields }, { status: 400 });
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      const target = (e.meta?.target as string[] | undefined)?.join(", ");
      return NextResponse.json({ error: `Dữ liệu bị trùng${target ? ` (${target})` : ""}`, code: "DUPLICATE" }, { status: 409 });
    }
    if (e.code === "P2025") return NextResponse.json({ error: "Không tìm thấy dữ liệu", code: "NOT_FOUND" }, { status: 404 });
    if (e.code === "P2003") return NextResponse.json({ error: "Dữ liệu đang được tham chiếu, không thể thực hiện", code: "FK" }, { status: 409 });
  }
  // Không đưa chi tiết lỗi nội bộ (có thể chứa dữ liệu cá nhân) ra ngoài hay vào log
  console.error("[api] lỗi không mong đợi:", e instanceof Error ? `${e.name}: ${e.message.slice(0, 200)}` : "unknown");
  return NextResponse.json({ error: "Lỗi hệ thống, vui lòng thử lại" }, { status: 500 });
}

export function api(handler: Handler, opts: Options = {}) {
  return async (req: NextRequest, context: { params: Promise<Params> }) => {
    try {
      if (!checkOrigin(req)) throw new HttpError(403, "Yêu cầu không hợp lệ (CSRF)", "CSRF");
      const state = await getSessionState();
      if (state.status === "none") throw new HttpError(401, "Phiên đăng nhập đã hết hạn", "UNAUTHENTICATED");
      if (state.status === "mfa_pending") throw new HttpError(401, "Cần xác thực hai lớp", "MFA_REQUIRED");
      const ctx = state.ctx;
      if (!opts.allowRestricted) {
        if (ctx.mustChangePassword) throw new HttpError(403, "Bạn cần đổi mật khẩu trước", "PASSWORD_CHANGE_REQUIRED");
        if (await mfaRequiredButMissing(ctx)) throw new HttpError(403, "Bạn cần bật xác thực hai lớp", "MFA_SETUP_REQUIRED");
      }
      const params = context?.params ? await context.params : {};
      const result = await handler(req, { ctx, params });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Route công khai (đăng nhập...) – vẫn kiểm tra origin và xử lý lỗi thống nhất */
export function publicApi(handler: (req: NextRequest) => Promise<Response | unknown>) {
  return async (req: NextRequest) => {
    try {
      if (!checkOrigin(req)) throw new HttpError(403, "Yêu cầu không hợp lệ (CSRF)", "CSRF");
      const result = await handler(req);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function parseBody<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Nội dung yêu cầu không phải JSON hợp lệ");
  }
  return schema.parse(raw);
}

export function searchParams(req: NextRequest) {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}

export function pageParams(sp: Record<string, string | undefined>, defaultSize = 20) {
  const page = Math.max(1, Number(sp.page) || 1);
  const size = Math.min(100, Math.max(5, Number(sp.size) || defaultSize));
  return { page, size, skip: (page - 1) * size, take: size };
}

/** Rate limit đơn giản trong bộ nhớ (theo instance) */
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= max;
}

/** Đã vượt ngưỡng chưa (không tăng bộ đếm) */
export function isRateLimited(key: string, max: number): boolean {
  const b = buckets.get(key);
  return !!b && b.resetAt >= Date.now() && b.count >= max;
}

/** Ghi nhận 1 lần (ví dụ 1 lần đăng nhập sai) */
export function recordHit(key: string, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) buckets.set(key, { count: 1, resetAt: now + windowMs });
  else b.count++;
}

export function fileResponse(buf: Buffer | Uint8Array, fileName: string, mime: string, inline = false) {
  const encoded = encodeURIComponent(fileName);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
