import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth";
import { pageParams } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { spGet, type SP } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader, Pagination, Tabs } from "@/components/ui/misc";
import { ActionButton } from "@/components/form-dialog";
import { cn } from "@/lib/utils";

export const metadata = { title: "Thông báo" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePageAuth();
  const sp = await searchParams;
  const unreadOnly = spGet(sp, "unread") === "1";
  const { page, size, skip, take } = pageParams({ page: spGet(sp, "page") });
  const where = { userId: ctx.userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [total, unread, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: ctx.userId, readAt: null } }),
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
  ]);
  return (
    <div>
      <PageHeader
        title="Thông báo"
        description="Thông báo trong ứng dụng. Kênh email/bên ngoài chỉ hoạt động sau khi cấu hình tích hợp."
        actions={unread > 0 && <ActionButton url="/api/notifications" method="PATCH" body={{ all: true }} label="Đánh dấu tất cả đã đọc" successMessage="Đã đánh dấu đã đọc" />}
      />
      <Tabs
        items={[
          { key: "all", label: "Tất cả", href: "?" },
          { key: "unread", label: `Chưa đọc (${unread})`, href: "?unread=1" },
        ]}
        active={unreadOnly ? "unread" : "all"}
      />
      <Card>
        {items.length === 0 ? (
          <EmptyState title="Không có thông báo" />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id} className={cn("flex items-start gap-3 px-5 py-3", !n.readAt && "bg-primary-soft/40")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                <div className="min-w-0 flex-1">
                  {n.link ? (
                    <Link href={n.link} className={cn("text-sm hover:underline", !n.readAt && "font-semibold")}>
                      {n.title}
                    </Link>
                  ) : (
                    <p className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</p>
                  )}
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                  <p className="text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</p>
                </div>
                {!n.readAt && <ActionButton url="/api/notifications" method="PATCH" body={{ ids: [n.id] }} label="Đã đọc" variant="ghost" successMessage="Đã đánh dấu" />}
              </li>
            ))}
          </ul>
        )}
        <Pagination page={page} size={size} total={total} baseParams={{ unread: unreadOnly ? "1" : undefined }} />
      </Card>
    </div>
  );
}
