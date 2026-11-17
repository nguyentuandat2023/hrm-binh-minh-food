import { afterEach, describe, expect, it } from "vitest";
import { appOrigin, publicOrigin } from "@/lib/app-url";

const saved = process.env.APP_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = saved;
});

describe("APP_URL", () => {
  it("lấy origin từ URL hợp lệ", () => {
    expect(appOrigin("https://hrm.congty.vn/")).toBe("https://hrm.congty.vn");
    expect(appOrigin(" http://localhost:3000 ")).toBe("http://localhost:3000");
  });

  it("không ném lỗi khi rỗng hoặc dở dang (Railway chưa cấp tên miền)", () => {
    expect(appOrigin(undefined)).toBeNull();
    expect(appOrigin("")).toBeNull();
    expect(appOrigin("https://")).toBeNull();
    expect(appOrigin("khong-phai-url")).toBeNull();
    expect(appOrigin("javascript:alert(1)")).toBeNull();
  });

  it("link QR dùng Host do proxy chuyển tới khi APP_URL chưa hợp lệ", () => {
    process.env.APP_URL = "https://";
    const h = new Headers({ host: "hrm.up.railway.app", "x-forwarded-proto": "https" });
    expect(publicOrigin(h, "http://0.0.0.0:3000")).toBe("https://hrm.up.railway.app");
    expect(publicOrigin(new Headers(), "http://0.0.0.0:3000")).toBe("http://0.0.0.0:3000");
  });

  it("link QR ưu tiên APP_URL khi hợp lệ", () => {
    process.env.APP_URL = "https://hrm.congty.vn";
    expect(publicOrigin(new Headers({ host: "evil.example" }), "http://x")).toBe("https://hrm.congty.vn");
  });
});
