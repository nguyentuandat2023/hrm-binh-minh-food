import { can, type AuthCtx } from "./rbac";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  group?: string;
}

/** Menu chỉ hiển thị mục user có quyền – quyền vẫn được kiểm tra lại ở từng trang/API */
export function buildNav(ctx: AuthCtx, counts: { approvals: number; unread: number }): NavItem[] {
  const items: (NavItem & { show: boolean })[] = [
    { href: "/", label: "Tổng quan", icon: "dashboard", show: can(ctx, "dashboard.view") },
    { href: "/me", label: "Cổng nhân viên", icon: "me", show: !!ctx.employee },
    { href: "/employees", label: "Nhân viên", icon: "users", show: can(ctx, "employee.view", "TEAM"), group: "Nhân sự" },
    { href: "/departments", label: "Phòng ban", icon: "building", show: can(ctx, "org.view"), group: "Nhân sự" },
    { href: "/org-chart", label: "Sơ đồ tổ chức", icon: "network", show: can(ctx, "org.view"), group: "Nhân sự" },
    { href: "/attendance", label: "Chấm công", icon: "clock", show: can(ctx, "attendance.view", "TEAM"), group: "Thời gian" },
    { href: "/shifts", label: "Ca làm việc", icon: "shift", show: can(ctx, "attendance.update"), group: "Thời gian" },
    { href: "/leave", label: "Nghỉ phép", icon: "leave", show: can(ctx, "leave.view", "TEAM"), group: "Thời gian" },
    { href: "/approvals", label: "Phê duyệt", icon: "approve", badge: counts.approvals, show: can(ctx, "leave.approve") || can(ctx, "attendance.approve"), group: "Thời gian" },
    { href: "/payroll", label: "Tiền lương", icon: "wallet", show: can(ctx, "payroll.view"), group: "Lương & hiệu suất" },
    { href: "/kpi", label: "KPI", icon: "target", show: can(ctx, "kpi.view", "TEAM"), group: "Lương & hiệu suất" },
    { href: "/recruitment", label: "Tuyển dụng", icon: "briefcase", show: can(ctx, "recruitment.view"), group: "Vòng đời" },
    { href: "/lifecycle", label: "Tiếp nhận / nghỉ việc", icon: "lifecycle", show: can(ctx, "lifecycle.view", "TEAM"), group: "Vòng đời" },
    { href: "/assets", label: "Tài sản", icon: "laptop", show: can(ctx, "asset.view", "TEAM"), group: "Vòng đời" },
    { href: "/reports", label: "Báo cáo", icon: "chart", show: can(ctx, "report.view"), group: "Phân tích" },
    { href: "/insights", label: "HR Insights", icon: "insight", show: can(ctx, "insights.view"), group: "Phân tích" },
    { href: "/notifications", label: "Thông báo", icon: "bell", badge: counts.unread, show: true, group: "Hệ thống" },
    {
      href: "/settings",
      label: "Cài đặt",
      icon: "settings",
      show: ["admin_user.view", "admin_role.view", "admin_setting.view", "admin_audit.view", "admin_backup.view", "leave.update", "org.update"].some((k) => can(ctx, k)),
      group: "Hệ thống",
    },
  ];
  return items.filter((i) => i.show).map(({ show: _s, ...rest }) => rest);
}
