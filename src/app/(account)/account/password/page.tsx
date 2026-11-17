import { requirePageAuth } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/misc";
import { ChangePasswordForm } from "./form";

export const metadata = { title: "Đổi mật khẩu" };

export default async function PasswordPage() {
  const ctx = await requirePageAuth({ allowPasswordChange: true });
  const sec = await getSetting("security");
  return (
    <Card>
      <CardHeader title="Đổi mật khẩu" description={ctx.email} />
      <CardContent className="space-y-4">
        {ctx.mustChangePassword && <Notice tone="warning">Bạn đang dùng mật khẩu tạm thời. Vui lòng đặt mật khẩu mới để tiếp tục.</Notice>}
        <ChangePasswordForm minLength={sec.passwordMinLength} />
      </CardContent>
    </Card>
  );
}
