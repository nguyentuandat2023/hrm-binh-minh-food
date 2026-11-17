import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-5xl font-bold text-primary">404</p>
      <p className="text-lg font-medium">Không tìm thấy trang</p>
      <Link href="/" className="text-sm text-primary hover:underline">
        Về trang chủ
      </Link>
    </main>
  );
}
