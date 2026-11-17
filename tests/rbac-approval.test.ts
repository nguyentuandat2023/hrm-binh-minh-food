import { describe, expect, it } from "vitest";
import { canAccessEmployee, mergeScopes, employeeScopeWhere, type AuthCtx } from "@/lib/rbac";
import { approvalBlockReason } from "@/lib/services/approval";
import type { Scope } from "@/lib/permissions";

const ctx = (perms: Record<string, Scope>, emp = { id: "mgr", departmentId: "D1", branchId: "B1" }, depts = ["D1"]): AuthCtx => ({
  userId: "u-" + emp.id,
  email: "x@y.z",
  sessionId: "s",
  roleKeys: [],
  perms,
  employee: { ...emp, fullName: "X", code: "NV", avatarFileId: null },
  departmentIds: depts,
  totpEnabled: false,
  mustChangePassword: false,
});
const self = { id: "mgr", departmentId: "D1", branchId: "B1", managerId: null };
const report = { id: "e1", departmentId: "D2", branchId: "B2", managerId: "mgr" };
const sameDept = { id: "e2", departmentId: "D1", branchId: "B1", managerId: "x" };
const sameBranch = { id: "e3", departmentId: "D9", branchId: "B1", managerId: "x" };
const other = { id: "e4", departmentId: "D9", branchId: "B9", managerId: "x" };

describe("Phạm vi dữ liệu", () => {
  it("SELF chỉ chính mình", () => {
    const c = ctx({ "employee.view": "SELF" });
    expect(canAccessEmployee(c, "employee.view", self)).toBe(true);
    expect(canAccessEmployee(c, "employee.view", report)).toBe(false);
  });
  it("TEAM gồm nhân viên trực tiếp", () => {
    const c = ctx({ "employee.view": "TEAM" });
    expect(canAccessEmployee(c, "employee.view", report)).toBe(true);
    expect(canAccessEmployee(c, "employee.view", sameDept)).toBe(false);
  });
  it("DEPARTMENT gồm phòng ban", () => {
    const c = ctx({ "employee.view": "DEPARTMENT" });
    expect(canAccessEmployee(c, "employee.view", sameDept)).toBe(true);
    expect(canAccessEmployee(c, "employee.view", sameBranch)).toBe(false);
  });
  it("BRANCH gồm chi nhánh, COMPANY gồm tất cả", () => {
    expect(canAccessEmployee(ctx({ "employee.view": "BRANCH" }), "employee.view", sameBranch)).toBe(true);
    expect(canAccessEmployee(ctx({ "employee.view": "BRANCH" }), "employee.view", other)).toBe(false);
    expect(canAccessEmployee(ctx({ "employee.view": "COMPANY" }), "employee.view", other)).toBe(true);
  });
  it("không có quyền → không truy cập", () => expect(canAccessEmployee(ctx({}), "salary.view", self)).toBe(false));
  it("gộp nhiều vai trò lấy phạm vi rộng nhất", () => {
    expect(mergeScopes([{ key: "a", scope: "SELF" }, { key: "a", scope: "DEPARTMENT" }, { key: "a", scope: "TEAM" }]).a).toBe("DEPARTMENT");
  });
  it("điều kiện truy vấn COMPANY không giới hạn; không có quyền → lỗi 403", () => {
    expect(employeeScopeWhere(ctx({ "employee.view": "COMPANY" }), "employee.view")).toEqual({});
    expect(() => employeeScopeWhere(ctx({}), "employee.view")).toThrow();
  });
});

describe("Phê duyệt nhiều cấp", () => {
  const req = (over: Partial<Parameters<typeof approvalBlockReason>[1]> = {}) => ({ type: "LEAVE" as const, status: "PENDING", currentLevel: 1, employee: sameDept, priorActors: [], ...over });
  const manager = ctx({ "leave.approve": "DEPARTMENT" });
  const hr = ctx({ "leave.approve": "COMPANY" }, { id: "hr", departmentId: "HR", branchId: "B1" }, ["HR"]);
  it("trưởng phòng duyệt cấp 1 trong phòng", () => expect(approvalBlockReason(manager, req())).toBeNull());
  it("không tự duyệt yêu cầu của mình", () => expect(approvalBlockReason(manager, req({ employee: self }))).toMatch(/chính mình/));
  it("ngoài phạm vi không duyệt được", () => expect(approvalBlockReason(manager, req({ employee: other }))).not.toBeNull());
  it("cấp 2 cần quyền toàn công ty", () => {
    expect(approvalBlockReason(manager, req({ currentLevel: 2 }))).toMatch(/toàn công ty/);
    expect(approvalBlockReason(hr, req({ currentLevel: 2 }))).toBeNull();
  });
  it("một người không duyệt 2 cấp", () => expect(approvalBlockReason(hr, req({ currentLevel: 2, priorActors: [hr.userId] }))).toMatch(/cấp trước/));
  it("yêu cầu đã xử lý", () => expect(approvalBlockReason(hr, req({ status: "APPROVED" }))).toMatch(/đã được xử lý/));
});
