import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarHeart, Building, DatabaseBackup, KeyRound, ScrollText, Shield, Users, Wallet } from "lucide-react";
import { requirePageAuth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Cài đặt" };

export default async function SettingsIndex() {
  const ctx = await requirePageAuth();
  const items = [
    { href: "/settings/users", title: "Tài khoản", desc: "Tạo tài khoản, khoá/mở, đặt lại mật khẩu, gán vai trò, thu hồi phiên", icon: Users, show: can(ctx, "admin_user.view") },
    { href: "/settings/roles", title: "Phân quyền", desc: "Ma trận quyền theo module, hành động và phạm vi dữ liệu", icon: Shield, show: can(ctx, "admin_role.view") },
    { href: "/settings/company", title: "Cấu hình doanh nghiệp", desc: "Thông tin công ty, quy tắc chấm công, chính sách phép, tăng ca, bảo mật, thông báo, mẫu biểu", icon: Building, show: can(ctx, "admin_setting.view") || can(ctx, "leave.update", "COMPANY") },
    { href: "/settings/holidays", title: "Ngày nghỉ lễ", desc: "Lịch nghỉ lễ áp dụng cho chấm công và nghỉ phép", icon: CalendarHeart, show: can(ctx, "leave.update", "COMPANY") || can(ctx, "admin_setting.view") },
    { href: "/payroll/config", title: "Cấu hình lương", desc: "Phiên bản công thức: bảo hiểm, thuế TNCN, giảm trừ, hệ số tăng ca", icon: Wallet, show: can(ctx, "payroll.update") },
    { href: "/settings/audit", title: "Nhật ký hệ thống", desc: "Đăng nhập, chỉnh sửa, phê duyệt, xuất dữ liệu", icon: ScrollText, show: can(ctx, "admin_audit.view") },
    { href: "/settings/backup", title: "Sao lưu & khôi phục", desc: "Trạng thái sao lưu, hướng dẫn khôi phục, tác vụ tự động", icon: DatabaseBackup, show: can(ctx, "admin_backup.view") },
    { href: "/account/security", title: "Bảo mật tài khoản của tôi", desc: "Xác thực hai lớp, phiên đăng nhập", icon: KeyRound, show: true },
  ].filter((i) => i.show);
  if (items.length <= 1) redirect("/account/security");
  return (
    <div>
      <PageHeader title="Cài đặt & quản trị hệ thống" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((i) => (
          <Link key={i.href} href={i.href}>
            <Card className="flex h-full gap-4 p-5 transition-colors hover:border-primary/50">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <i.icon className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">{i.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{i.desc}</span>
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
