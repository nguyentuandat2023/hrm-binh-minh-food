import Link from "next/link";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-lg">
        <Link href="/" className="mb-6 flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">HR</span>
          Quay lại ứng dụng
        </Link>
        {children}
      </div>
    </main>
  );
}
