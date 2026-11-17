import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Không có quyền" };

export default function Forbidden() {
  return (
    <Card>
      <EmptyState
        icon={<ShieldAlert />}
        title="Bạn không có quyền truy cập trang này"
        description="Nếu bạn cần quyền này cho công việc, hãy liên hệ HR hoặc quản trị hệ thống."
        action={<LinkButton href="/">Về trang chủ</LinkButton>}
      />
    </Card>
  );
}
