import { requirePageAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { MfaPanel } from "./mfa-panel";

export const metadata = { title: "Bảo mật tài khoản" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const ctx = await requirePageAuth({ allowMfaSetup: true });
  const sp = await searchParams;
  const sessions = await prisma.session.findMany({
    where: { userId: ctx.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    take: 10,
  });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Xác thực hai lớp (TOTP)" description="Bảo vệ tài khoản bằng mã 6 số từ ứng dụng Google Authenticator / Microsoft Authenticator." actions={ctx.totpEnabled ? <Badge tone="green">Đang bật</Badge> : <Badge tone="slate">Chưa bật</Badge>} />
        <CardContent className="space-y-4">
          {sp.required && !ctx.totpEnabled && <Notice tone="warning">Chính sách công ty yêu cầu tài khoản có quyền quản trị/nhân sự/lương phải bật xác thực hai lớp trước khi tiếp tục.</Notice>}
          <MfaPanel enabled={ctx.totpEnabled} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Phiên đăng nhập đang hoạt động" />
        <CardContent className="space-y-2 text-sm">
          {sessions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
              <span className="min-w-0 truncate">{s.userAgent?.slice(0, 80) ?? "Không rõ thiết bị"}</span>
              <span className="text-xs text-muted-foreground">
                {s.id === ctx.sessionId ? "Phiên hiện tại · " : ""}
                {s.ip ?? ""} · hoạt động {fmtDateTime(s.lastSeenAt)}
              </span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Đổi mật khẩu sẽ tự động đăng xuất các phiên khác. Quản trị viên có thể thu hồi toàn bộ phiên của bạn khi cần.</p>
        </CardContent>
      </Card>
    </div>
  );
}
