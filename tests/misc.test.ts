import { describe, expect, it } from "vitest";
import { kpiCompletion, kpiRating, weightedScore } from "@/lib/kpi-calc";
import { addDays, monthRange, vnDateKey, vnDateTime, yearsBetween } from "@/lib/dates";
import { fmtDate, fmtVND, unaccent } from "@/lib/format";
import { allPermissionKeys, DEFAULT_ROLE_MATRIX } from "@/lib/permissions";

describe("KPI", () => {
  it("càng cao càng tốt, giới hạn 150%", () => {
    expect(kpiCompletion("HIGHER_BETTER", 100, 80)).toBe(0.8);
    expect(kpiCompletion("HIGHER_BETTER", 100, 300)).toBe(1.5);
    expect(kpiCompletion("HIGHER_BETTER", 100, null)).toBeNull();
  });
  it("càng thấp càng tốt", () => {
    expect(kpiCompletion("LOWER_BETTER", 3, 3)).toBe(1);
    expect(kpiCompletion("LOWER_BETTER", 3, 6)).toBe(0.5);
  });
  it("điểm có trọng số bỏ qua KPI chưa có kết quả", () => {
    expect(weightedScore([{ weight: 0.6, completion: 1 }, { weight: 0.4, completion: 0.5 }])).toBeCloseTo(0.8);
    expect(weightedScore([{ weight: 1, completion: null }])).toBeNull();
    expect(kpiRating(1.2).label).toBe("Xuất sắc");
  });
});

describe("Ngày giờ Việt Nam", () => {
  it("23:30 UTC = ngày hôm sau tại VN", () => expect(vnDateKey(new Date("2026-11-16T23:30:00Z"))).toBe("2026-11-17"));
  it("ghép ngày + giờ VN → UTC", () => expect(vnDateTime("2026-11-17", "08:00").toISOString()).toBe("2026-11-17T01:00:00.000Z"));
  it("cộng ngày qua tháng, tháng 2 năm nhuận", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(monthRange(2028, 2).days).toBe(29);
  });
  it("số năm thâm niên", () => expect(yearsBetween("2021-11-18", "2026-11-17")).toBe(4));
  it("định dạng Việt Nam", () => {
    expect(fmtDate("2026-11-17")).toBe("17/11/2026");
    expect(fmtVND(1234567).replace(/\s/g, " ")).toMatch(/1\.234\.567/);
    expect(unaccent("Nguyễn Văn Đức")).toBe("Nguyen Van Duc");
  });
});

describe("Ma trận quyền mặc định", () => {
  it("chỉ tham chiếu quyền tồn tại", () => {
    const keys = new Set(allPermissionKeys());
    for (const [role, m] of Object.entries(DEFAULT_ROLE_MATRIX)) for (const k of Object.keys(m)) expect(keys.has(k), `${role}: ${k}`).toBe(true);
  });
  it("nhân viên không có quyền quản trị, lương toàn công ty", () => {
    const m = DEFAULT_ROLE_MATRIX.EMPLOYEE;
    expect(m["admin_user.view"]).toBeUndefined();
    expect(m["payroll.view"]).toBeUndefined();
    expect(m["salary.view"]).toBe("SELF");
  });
  it("trưởng phòng chỉ phạm vi phòng ban", () => expect(DEFAULT_ROLE_MATRIX.DEPT_MANAGER["employee.view"]).toBe("DEPARTMENT"));
});
