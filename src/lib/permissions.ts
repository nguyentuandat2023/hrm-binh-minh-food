// Danh mục quyền theo module × hành động, và ma trận quyền mặc định cho các vai trò hệ thống.
// Phạm vi dữ liệu: SELF (bản thân) < TEAM (nhóm trực tiếp) < DEPARTMENT < BRANCH < COMPANY.

export type Scope = "SELF" | "TEAM" | "DEPARTMENT" | "BRANCH" | "COMPANY";
export const SCOPE_RANK: Record<Scope, number> = { SELF: 1, TEAM: 2, DEPARTMENT: 3, BRANCH: 4, COMPANY: 5 };
export const SCOPE_LABEL: Record<Scope, string> = {
  SELF: "Bản thân",
  TEAM: "Nhóm",
  DEPARTMENT: "Phòng ban",
  BRANCH: "Chi nhánh",
  COMPANY: "Toàn công ty",
};

export const ACTIONS = ["view", "create", "update", "delete", "approve", "export"] as const;
export type Action = (typeof ACTIONS)[number];
export const ACTION_LABEL: Record<Action, string> = {
  view: "Xem",
  create: "Thêm",
  update: "Sửa",
  delete: "Xóa/Ngừng",
  approve: "Duyệt",
  export: "Xuất",
};

export interface ModuleDef {
  key: string;
  name: string;
  actions: Partial<Record<Action, string>>; // mô tả cụ thể của từng hành động
  companyOnly?: boolean; // module quản trị – phạm vi luôn là toàn công ty
}

export const MODULES: ModuleDef[] = [
  { key: "dashboard", name: "Dashboard", actions: { view: "Xem số liệu tổng quan" } },
  {
    key: "employee",
    name: "Hồ sơ nhân viên",
    actions: { view: "Xem hồ sơ (thông tin công việc)", create: "Thêm / nhập Excel", update: "Sửa hồ sơ", delete: "Ngừng kích hoạt hồ sơ", export: "Xuất danh sách" },
  },
  {
    key: "employee_private",
    name: "Thông tin cá nhân nhạy cảm",
    actions: { view: "Xem CCCD, ngày sinh, địa chỉ, liên hệ khẩn cấp", update: "Sửa thông tin cá nhân" },
  },
  { key: "salary", name: "Thông tin lương & tài khoản", actions: { view: "Xem lương, phụ cấp, tài khoản ngân hàng", update: "Điều chỉnh lương" } },
  { key: "contract", name: "Hợp đồng lao động", actions: { view: "Xem hợp đồng", create: "Tạo / gia hạn hợp đồng", update: "Sửa / chấm dứt hợp đồng" } },
  { key: "document", name: "Tài liệu nhân viên", actions: { view: "Xem/tải tài liệu", create: "Tải lên tài liệu", delete: "Xóa tài liệu" } },
  {
    key: "org",
    name: "Phòng ban, chi nhánh, chức vụ",
    actions: { view: "Xem cơ cấu tổ chức", create: "Tạo mới", update: "Sửa, gán trưởng phòng", delete: "Ngừng hoạt động" },
  },
  {
    key: "attendance",
    name: "Chấm công & ca làm",
    actions: { view: "Xem bảng công", create: "Chấm công, gửi đề nghị điều chỉnh/tăng ca", update: "Quản lý ca, phân ca, sửa công", approve: "Duyệt điều chỉnh công / tăng ca", export: "Xuất bảng công" },
  },
  {
    key: "leave",
    name: "Nghỉ phép",
    actions: { view: "Xem đơn và lịch nghỉ", create: "Gửi đơn nghỉ", update: "Cấu hình loại phép, số ngày phép", approve: "Duyệt đơn nghỉ", export: "Xuất dữ liệu nghỉ" },
  },
  {
    key: "payroll",
    name: "Tiền lương",
    actions: { view: "Xem bảng lương", create: "Tạo kỳ lương, nhập khoản, tính lương", update: "Cấu hình công thức lương", approve: "Duyệt & khóa kỳ lương", export: "Xuất bảng lương" },
  },
  { key: "payslip", name: "Phiếu lương", actions: { view: "Xem phiếu lương" } },
  {
    key: "kpi",
    name: "KPI & đánh giá",
    actions: { view: "Xem KPI", create: "Giao KPI", update: "Cập nhật kết quả", approve: "Đánh giá / chốt KPI", export: "Xuất báo cáo KPI" },
  },
  {
    key: "recruitment",
    name: "Tuyển dụng",
    actions: { view: "Xem tuyển dụng", create: "Tạo vị trí, thêm ứng viên", update: "Cập nhật ứng viên, phỏng vấn", delete: "Đóng / loại", export: "Xuất dữ liệu" },
  },
  { key: "lifecycle", name: "Tiếp nhận / nghỉ việc", actions: { view: "Xem checklist", create: "Tạo checklist", update: "Cập nhật / hoàn tất" } },
  { key: "asset", name: "Tài sản", actions: { view: "Xem tài sản", create: "Thêm tài sản", update: "Bàn giao / thu hồi", export: "Xuất biên bản" } },
  { key: "report", name: "Báo cáo", actions: { view: "Xem báo cáo", export: "Xuất báo cáo" } },
  { key: "insights", name: "HR Insights", actions: { view: "Xem cảnh báo & gợi ý" } },
  { key: "admin_user", name: "Quản trị tài khoản", companyOnly: true, actions: { view: "Xem tài khoản", create: "Tạo tài khoản", update: "Khóa/mở, đặt lại mật khẩu, gán vai trò, thu hồi phiên" } },
  { key: "admin_role", name: "Quản trị phân quyền", companyOnly: true, actions: { view: "Xem ma trận quyền", update: "Sửa ma trận quyền" } },
  { key: "admin_setting", name: "Cấu hình doanh nghiệp", companyOnly: true, actions: { view: "Xem cấu hình", update: "Sửa cấu hình" } },
  { key: "admin_audit", name: "Nhật ký hệ thống", companyOnly: true, actions: { view: "Xem nhật ký", export: "Xuất nhật ký" } },
  { key: "admin_backup", name: "Sao lưu & khôi phục", companyOnly: true, actions: { view: "Xem trạng thái sao lưu" } },
];

export function allPermissionKeys(): string[] {
  return MODULES.flatMap((m) => Object.keys(m.actions).map((a) => `${m.key}.${a}`));
}

export const SYSTEM_ROLES = [
  { key: "SUPER_ADMIN", name: "Super Admin", description: "Toàn quyền hệ thống" },
  { key: "DIRECTOR", name: "Ban giám đốc", description: "Xem toàn bộ, duyệt các yêu cầu và kỳ lương" },
  { key: "HR_ADMIN", name: "HR Admin", description: "Quản trị nhân sự toàn công ty" },
  { key: "DEPT_MANAGER", name: "Trưởng phòng", description: "Quản lý và duyệt cho phòng ban của mình" },
  { key: "PAYROLL", name: "Kế toán tiền lương", description: "Tính lương, xuất bảng lương" },
  { key: "EMPLOYEE", name: "Nhân viên", description: "Tự phục vụ: hồ sơ, chấm công, nghỉ phép, phiếu lương" },
] as const;

type Matrix = Record<string, Scope>;
const all = (scope: Scope): Matrix => Object.fromEntries(allPermissionKeys().map((k) => [k, scope]));
const pick = (keys: string[], scope: Scope): Matrix => Object.fromEntries(keys.map((k) => [k, scope]));

const SELF_SERVICE = pick(
  [
    "employee.view",
    "employee_private.view",
    "employee_private.update",
    "salary.view",
    "contract.view",
    "document.view",
    "attendance.view",
    "attendance.create",
    "leave.view",
    "leave.create",
    "payslip.view",
    "kpi.view",
    "kpi.update",
    "asset.view",
    "lifecycle.view",
  ],
  "SELF",
);

export const DEFAULT_ROLE_MATRIX: Record<string, Matrix> = {
  SUPER_ADMIN: all("COMPANY"),
  DIRECTOR: {
    ...SELF_SERVICE,
    ...pick(
      [
        "dashboard.view",
        "employee.view",
        "employee.export",
        "employee_private.view",
        "salary.view",
        "contract.view",
        "document.view",
        "org.view",
        "attendance.view",
        "attendance.approve",
        "attendance.export",
        "leave.view",
        "leave.approve",
        "leave.export",
        "payroll.view",
        "payroll.approve",
        "payroll.export",
        "payslip.view",
        "kpi.view",
        "kpi.create",
        "kpi.approve",
        "kpi.export",
        "recruitment.view",
        "lifecycle.view",
        "asset.view",
        "report.view",
        "report.export",
        "insights.view",
        "admin_audit.view",
      ],
      "COMPANY",
    ),
  },
  HR_ADMIN: {
    ...SELF_SERVICE,
    ...pick(
      [
        "dashboard.view",
        "employee.view",
        "employee.create",
        "employee.update",
        "employee.delete",
        "employee.export",
        "employee_private.view",
        "employee_private.update",
        "salary.view",
        "salary.update",
        "contract.view",
        "contract.create",
        "contract.update",
        "document.view",
        "document.create",
        "document.delete",
        "org.view",
        "org.create",
        "org.update",
        "org.delete",
        "attendance.view",
        "attendance.update",
        "attendance.approve",
        "attendance.export",
        "leave.view",
        "leave.update",
        "leave.approve",
        "leave.export",
        "payroll.view",
        "payroll.create",
        "payroll.export",
        "payslip.view",
        "kpi.view",
        "kpi.create",
        "kpi.approve",
        "kpi.export",
        "recruitment.view",
        "recruitment.create",
        "recruitment.update",
        "recruitment.delete",
        "recruitment.export",
        "lifecycle.view",
        "lifecycle.create",
        "lifecycle.update",
        "asset.view",
        "asset.create",
        "asset.update",
        "asset.export",
        "report.view",
        "report.export",
        "insights.view",
        "admin_user.view",
        "admin_user.create",
        "admin_user.update",
        "admin_setting.view",
        "admin_setting.update",
        "admin_audit.view",
      ],
      "COMPANY",
    ),
    "attendance.create": "SELF",
    "leave.create": "SELF",
  },
  DEPT_MANAGER: {
    ...SELF_SERVICE,
    ...pick(
      [
        "dashboard.view",
        "employee.view",
        "attendance.view",
        "attendance.approve",
        "attendance.export",
        "leave.view",
        "leave.approve",
        "kpi.view",
        "kpi.create",
        "kpi.approve",
        "recruitment.view",
        "lifecycle.view",
        "report.view",
        "insights.view",
      ],
      "DEPARTMENT",
    ),
    "org.view": "COMPANY",
  },
  PAYROLL: {
    ...SELF_SERVICE,
    ...pick(
      [
        "dashboard.view",
        "employee.view",
        "salary.view",
        "attendance.view",
        "attendance.export",
        "leave.view",
        "payroll.view",
        "payroll.create",
        "payroll.update",
        "payroll.export",
        "payslip.view",
        "report.view",
        "report.export",
      ],
      "COMPANY",
    ),
    "org.view": "COMPANY",
  },
  EMPLOYEE: { ...SELF_SERVICE, "org.view": "COMPANY" },
};

export const PRIVILEGED_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL", "DIRECTOR"];
