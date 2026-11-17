"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  Clock,
  KeyRound,
  LayoutDashboard,
  Laptop,
  Lightbulb,
  LogOut,
  Menu,
  Moon,
  Network,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Target,
  UserCircle,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/misc";
import { apiFetch } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import type { NavItem } from "@/lib/nav";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  me: UserCircle,
  users: Users,
  building: Building2,
  network: Network,
  clock: Clock,
  shift: CalendarClock,
  leave: CalendarDays,
  approve: CheckSquare,
  wallet: Wallet,
  target: Target,
  briefcase: Briefcase,
  lifecycle: Repeat,
  laptop: Laptop,
  chart: BarChart3,
  insight: Lightbulb,
  bell: Bell,
  settings: Settings,
};

interface ShellProps {
  nav: NavItem[];
  user: { name: string; email: string; avatarFileId: string | null; roles: string };
  company: string;
  logoUrl: string | null;
  branches: { id: string; name: string }[] | null;
  branchId: string | null;
  canSearch: boolean;
  unread: number;
  children: React.ReactNode;
}

export function AppShell({ nav, user, company, logoUrl, branches, branchId, canSearch, unread, children }: ShellProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  React.useEffect(() => setOpen(false), [pathname]);

  let lastGroup: string | undefined;
  const navEl = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
      {nav.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        const active = item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/");
        const header = item.group && item.group !== lastGroup ? item.group : null;
        lastGroup = item.group;
        return (
          <React.Fragment key={item.href}>
            {header && <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">{header}</p>}
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-white/5 hover:text-white",
                active && "bg-sidebar-active font-medium text-white",
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {!!item.badge && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">{item.badge > 99 ? "99+" : item.badge}</span>}
            </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar lg:flex">
        <Brand company={company} logoUrl={logoUrl} />
        {navEl}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col bg-sidebar">
            <button className="absolute right-3 top-4 text-sidebar-foreground" onClick={() => setOpen(false)} aria-label="Đóng menu">
              <X className="size-5" />
            </button>
            <Brand company={company} logoUrl={logoUrl} />
            {navEl}
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} branches={branches} branchId={branchId} canSearch={canSearch} unread={unread} onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function Brand({ company, logoUrl }: { company: string; logoUrl: string | null }) {
  return (
    <Link href="/" className="flex h-16 items-center gap-3 border-b border-white/5 px-5">
      {logoUrl ? (
        // Nền trắng để logo màu (đỏ/vàng) luôn rõ trên thanh bên tối
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`Logo ${company}`} className="size-10 shrink-0 rounded-lg bg-white object-contain p-0.5" />
      ) : (
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">HR</span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">{company}</span>
        <span className="block text-xs text-sidebar-foreground/70">Quản lý nhân sự</span>
      </span>
    </Link>
  );
}

function Topbar({
  user,
  branches,
  branchId,
  canSearch,
  unread,
  onMenu,
}: {
  user: ShellProps["user"];
  branches: ShellProps["branches"];
  branchId: string | null;
  canSearch: boolean;
  unread: number;
  onMenu: () => void;
}) {
  const router = useRouter();
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("hrm-theme", next ? "dark" : "light");
    } catch {}
  };
  const setBranch = (id: string) => {
    document.cookie = `hrm_branch=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  };

  return (
    <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-card/90 px-3 backdrop-blur sm:gap-3 sm:px-6">
      <button className="rounded-md p-2 hover:bg-muted lg:hidden" onClick={onMenu} aria-label="Mở menu">
        <Menu className="size-5" />
      </button>
      {canSearch ? (
        <form
          className="relative min-w-0 max-w-md flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get("q")?.toString().trim();
            router.push(q ? `/employees?q=${encodeURIComponent(q)}` : "/employees");
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input name="q" placeholder="Tìm nhân viên (tên, mã, email, SĐT)…" className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" />
        </form>
      ) : (
        <div className="flex-1" />
      )}
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {branches && branches.length > 1 && (
          <select
            aria-label="Chọn chi nhánh"
            value={branchId ?? ""}
            onChange={(e) => setBranch(e.target.value)}
            className="hidden h-9 max-w-44 rounded-md border border-input bg-card px-2 text-sm sm:block"
          >
            <option value="">Tất cả chi nhánh</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
        <button className="rounded-md p-2 hover:bg-muted" onClick={toggleTheme} aria-label="Đổi giao diện sáng/tối">
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </button>
        <NotificationBell unread={unread} />
        <AccountMenu user={user} />
      </div>
    </header>
  );
}

type Noti = { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

function useOutside(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  React.useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, close]);
}

function NotificationBell({ unread }: { unread: number }) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<Noti[] | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const router = useRouter();
  useOutside(ref, () => setOpen(false));
  const load = async () => {
    setOpen((o) => !o);
    if (!open) {
      setItems(null);
      try {
        const r = await apiFetch<{ items: Noti[] }>("/api/notifications?size=8");
        setItems(r.items);
      } catch {
        setItems([]);
      }
    }
  };
  const openItem = async (n: Noti) => {
    if (!n.readAt) await apiFetch("/api/notifications", { method: "PATCH", body: { ids: [n.id] } }).catch(() => {});
    setOpen(false);
    router.push(n.link ?? "/notifications");
    router.refresh();
  };
  return (
    <div className="relative" ref={ref}>
      <button className="relative rounded-md p-2 hover:bg-muted" onClick={load} aria-label="Thông báo">
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-rose-600 px-1 text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Thông báo</span>
            <Link href="/notifications" className="text-xs text-primary hover:underline" onClick={() => setOpen(false)}>
              Xem tất cả
            </Link>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items === null ? (
              <div className="space-y-2 p-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Không có thông báo</p>
            ) : (
              items.map((n) => (
                <button key={n.id} onClick={() => openItem(n)} className={cn("block w-full border-b border-border px-4 py-3 text-left last:border-0 hover:bg-muted", !n.readAt && "bg-primary-soft/40")}>
                  <p className={cn("text-sm", !n.readAt && "font-semibold")}>{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground">{fmtDateTime(n.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu({ user }: { user: ShellProps["user"] }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };
  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2 rounded-md p-1 hover:bg-muted" onClick={() => setOpen((o) => !o)} aria-label="Menu tài khoản">
        <Avatar name={user.name} fileId={user.avatarFileId} size={32} />
        <span className="hidden max-w-36 truncate text-sm font-medium md:block">{user.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">{user.roles}</p>
          </div>
          <div className="p-1 text-sm">
            <MenuLink href="/me" icon={<UserCircle className="size-4" />} label="Hồ sơ của tôi" onClick={() => setOpen(false)} />
            <MenuLink href="/account/security" icon={<ShieldCheck className="size-4" />} label="Xác thực hai lớp" onClick={() => setOpen(false)} />
            <MenuLink href="/account/password" icon={<KeyRound className="size-4" />} label="Đổi mật khẩu" onClick={() => setOpen(false)} />
            <button onClick={logout} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-rose-600 hover:bg-muted">
              <LogOut className="size-4" /> Đăng xuất
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <Link href={href} onClick={onClick} className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted">
      {icon}
      {label}
    </Link>
  );
}
