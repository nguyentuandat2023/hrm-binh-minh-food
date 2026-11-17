import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmProvider } from "@/components/ui/dialog";

export const metadata: Metadata = {
  title: { default: "HRM – Quản lý nhân sự", template: "%s · HRM" },
  description: "Hệ thống quản lý nhân sự cho doanh nghiệp Việt Nam",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Áp dụng giao diện sáng/tối trước khi render để tránh nháy màn hình
const themeScript = `(function(){try{var t=localStorage.getItem('hrm-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
