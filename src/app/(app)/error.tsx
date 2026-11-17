"use client";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center">
      <AlertTriangle className="size-8 text-amber-500" />
      <p className="font-medium">Đã xảy ra lỗi khi tải trang</p>
      <p className="text-sm text-muted-foreground">Vui lòng thử lại. Nếu lỗi tiếp diễn, liên hệ quản trị hệ thống.</p>
      <Button onClick={reset}>Thử lại</Button>
    </Card>
  );
}
