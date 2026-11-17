export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "Dữ liệu") => new HttpError(404, `${what} không tồn tại`);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, "BAD_REQUEST", details);
export const conflict = (msg: string) => new HttpError(409, msg, "CONFLICT");
