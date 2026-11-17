import { redirect } from "next/navigation";
import { getSessionState } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { LoginForm } from "./login-form";

export const metadata = { title: "Đăng nhập" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ step?: string; next?: string }> }) {
  const sp = await searchParams;
  const state = await getSessionState();
  if (state.status === "ok") redirect(safeNext(sp.next));
  const company = await getSetting("company");
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {company.logoFileId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/logo?v=${company.logoFileId}`} alt={`Logo ${company.shortName || company.name}`} className="mx-auto mb-3 size-28 rounded-2xl bg-white object-contain p-1 shadow-sm" />
          ) : (
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">HR</div>
          )}
          <h1 className="text-xl font-semibold">{company.shortName || company.name}</h1>
          <p className="text-sm text-muted-foreground">Hệ thống quản lý nhân sự</p>
        </div>
        <LoginForm initialStep={state.status === "mfa_pending" || sp.step === "mfa" ? "mfa" : "password"} next={safeNext(sp.next)} />
      </div>
    </main>
  );
}

function safeNext(n?: string) {
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/";
}
