import { api } from "@/lib/api";
import { openApiSpec } from "@/lib/openapi";

/** Tài liệu OpenAPI (cần đăng nhập) */
export const GET = api(async () => openApiSpec());
