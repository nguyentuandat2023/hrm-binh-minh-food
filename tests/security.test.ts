import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";

process.env.DATA_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.QR_SECRET = "test-qr-secret-0123456789abcdef";
const { encrypt, decrypt, blindIndex, mask } = await import("@/lib/crypto");
const { totpAt, verifyTotp, base32Encode, base32Decode } = await import("@/lib/totp");
const { issueQrToken, verifyQrToken } = await import("@/lib/qr");
const { redact, diff } = await import("@/lib/audit");

describe("Mã hoá dữ liệu nhạy cảm", () => {
  it("mã hoá/giải mã AES-256-GCM, mỗi lần ra bản mã khác nhau", () => {
    const a = encrypt("012345678901")!;
    const b = encrypt("012345678901")!;
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("012345678901");
  });
  it("bản mã bị sửa → không giải mã được", () => {
    const a = encrypt("123456789")!;
    const parts = a.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
    expect(decrypt(parts.join("."))).toBeNull();
  });
  it("blind index chuẩn hoá khoảng trắng để chống trùng", () => expect(blindIndex("0123 4567 8901")).toBe(blindIndex("012345678901")));
  it("che số tài khoản", () => expect(mask("1234567890")).toBe("••••••7890"));
});

describe("TOTP (RFC 6238)", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("base32 encode/decode", () => expect(base32Decode(secret).toString()).toBe("12345678901234567890"));
  it("vector chuẩn RFC 6238 (T=59s → 287082, T=1111111109s → 081804)", () => {
    expect(totpAt(secret, 59_000)).toBe("287082");
    expect(totpAt(secret, 1_111_111_109_000)).toBe("081804");
  });
  it("chấp nhận lệch ±30s, từ chối mã sai", () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totpAt(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, now - 120_000), now)).toBe(false);
    expect(verifyTotp(secret, "abc123", now)).toBe(false);
  });
});

describe("Mã QR chấm công", () => {
  it("mã hợp lệ trong ~2 phút, hết hạn sau đó", () => {
    const t0 = 1_700_000_000_000;
    const { token } = issueQrToken("B1", t0);
    expect(verifyQrToken(token, t0 + 30_000)).toEqual({ ok: true, branchId: "B1" });
    expect(verifyQrToken(token, t0 + 5 * 60_000).ok).toBe(false);
  });
  it("mã bị giả mạo chữ ký", () => {
    const { token } = issueQrToken(null, Date.now());
    expect(verifyQrToken(token.slice(0, -3) + "xyz").ok).toBe(false);
  });
});

describe("Nhật ký không lộ dữ liệu nhạy cảm", () => {
  it("che lương, tài khoản ngân hàng, CCCD", () => {
    const r = redact({ baseSalary: 20_000_000, bankAccount: "123", nationalId: "0123", phone: "0901" })!;
    expect(r.baseSalary).not.toBe(20_000_000);
    expect(JSON.stringify(r)).not.toContain("0123");
    expect(r.phone).toBe("0901");
  });
  it("diff chỉ ghi trường thay đổi, giá trị nhạy cảm bị ẩn", () => {
    const d = diff({ fullName: "A", address: "HN" }, { fullName: "B", address: "HCM" });
    expect(d.fullName).toEqual({ from: "A", to: "B" });
    expect(JSON.stringify(d.address)).not.toContain("HCM");
  });
});
