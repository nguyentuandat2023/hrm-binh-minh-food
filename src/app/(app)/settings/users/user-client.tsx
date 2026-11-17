"use client";
import { useState } from "react";
import { Copy, MoreHorizontal, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { apiFetch, useAction } from "@/lib/client";

type RoleOpt = { value: string; label: string; key: string };

function TempPassword({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open onClose={onClose} title="Mật khẩu tạm thời" size="sm" footer={<Button onClick={onClose}>Đã lưu, đóng</Button>}>
      <div className="space-y-3 text-sm">
        <Notice tone="warning">Mật khẩu chỉ hiển thị MỘT LẦN. Hãy chuyển cho người dùng qua kênh an toàn. Người dùng bắt buộc đổi mật khẩu khi đăng nhập lần đầu.</Notice>
        <p>
          Tài khoản: <b>{email}</b>
        </p>
        <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 font-mono text-base">
          <span className="flex-1 break-all">{password}</span>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            }}
            aria-label="Sao chép"
          >
            <Copy className="size-4" />
          </button>
        </div>
        {copied && <p className="text-xs text-emerald-600">Đã sao chép</p>}
      </div>
    </Dialog>
  );
}

export function CreateUserDialog({ roles, employees }: { roles: RoleOpt[]; employees: { value: string; label: string; email: string | null }[] }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [roleIds, setRoleIds] = useState<string[]>(roles.filter((r) => r.key === "EMPLOYEE").map((r) => r.value));
  const [temp, setTemp] = useState<string | null>(null);
  const { run, loading, fieldErrors } = useAction();
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus /> Tạo tài khoản
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Tạo tài khoản"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Huỷ
            </Button>
            <Button
              loading={loading}
              disabled={!email || !roleIds.length}
              onClick={async () => {
                const r = await run(() => apiFetch<{ tempPassword: string }>("/api/admin/users", { body: { email, employeeId: employeeId || null, roleIds } }), "Đã tạo tài khoản");
                if (r) {
                  setOpen(false);
                  setTemp(r.tempPassword);
                }
              }}
            >
              Tạo tài khoản
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Liên kết hồ sơ nhân viên" hint="Để trống nếu là tài khoản quản trị không gắn nhân viên">
            <Select
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                const em = employees.find((x) => x.value === e.target.value)?.email;
                if (em && !email) setEmail(em);
              }}
            >
              <option value="">— Không liên kết —</option>
              {employees.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Email đăng nhập" required error={fieldErrors.email}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium">Vai trò</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {roles.map((r) => (
                <Checkbox key={r.value} label={r.label} checked={roleIds.includes(r.value)} onChange={(e) => setRoleIds((s) => (e.target.checked ? [...s, r.value] : s.filter((x) => x !== r.value)))} />
              ))}
            </div>
          </div>
        </div>
      </Dialog>
      {temp && <TempPassword email={email} password={temp} onClose={() => (setTemp(null), setEmail(""), setEmployeeId(""))} />}
    </>
  );
}

export function UserActions({ user, roles, isSelf }: { user: { id: string; email: string; isActive: boolean; totpEnabled: boolean; roleIds: string[] }; roles: RoleOpt[]; isSelf: boolean }) {
  const [menu, setMenu] = useState(false);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [picked, setPicked] = useState(user.roleIds);
  const [temp, setTemp] = useState<string | null>(null);
  const confirm = useConfirm();
  const { run, loading } = useAction();
  const act = async (action: string, title: string, message: string, danger = false) => {
    setMenu(false);
    if (!(await confirm({ title, message, danger }))) return;
    const r = await run(() => apiFetch<{ tempPassword?: string }>(`/api/admin/users/${user.id}`, { method: "PATCH", body: { action } }), "Đã thực hiện");
    if (r?.tempPassword) setTemp(r.tempPassword);
  };
  return (
    <div className="relative inline-block text-left">
      <Button variant="ghost" size="icon" onClick={() => setMenu((m) => !m)} aria-label="Thao tác" loading={loading}>
        <MoreHorizontal />
      </Button>
      {menu && (
        <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-card py-1 text-sm shadow-lg" onMouseLeave={() => setMenu(false)}>
          <button className="block w-full px-3 py-2 text-left hover:bg-muted" onClick={() => (setMenu(false), setRolesOpen(true))}>
            Gán vai trò
          </button>
          <button className="block w-full px-3 py-2 text-left hover:bg-muted" onClick={() => act("reset_password", `Đặt lại mật khẩu cho ${user.email}?`, "Hệ thống tạo mật khẩu tạm, đăng xuất mọi phiên của người dùng và buộc đổi mật khẩu khi đăng nhập.")}>
            Đặt lại mật khẩu
          </button>
          <button className="block w-full px-3 py-2 text-left hover:bg-muted" onClick={() => act("revoke_sessions", "Thu hồi mọi phiên đăng nhập?", "Người dùng sẽ bị đăng xuất khỏi mọi thiết bị.")}>
            Thu hồi phiên đăng nhập
          </button>
          {user.totpEnabled && (
            <button className="block w-full px-3 py-2 text-left hover:bg-muted" onClick={() => act("reset_mfa", "Đặt lại xác thực hai lớp?", "Dùng khi người dùng mất điện thoại. Họ sẽ phải thiết lập lại.")}>
              Đặt lại xác thực hai lớp
            </button>
          )}
          {!isSelf &&
            (user.isActive ? (
              <button className="block w-full px-3 py-2 text-left text-rose-600 hover:bg-muted" onClick={() => act("lock", `Khoá tài khoản ${user.email}?`, "Người dùng không thể đăng nhập cho đến khi được mở khoá.", true)}>
                Khoá tài khoản
              </button>
            ) : (
              <button className="block w-full px-3 py-2 text-left hover:bg-muted" onClick={() => act("unlock", `Mở khoá ${user.email}?`, "Người dùng có thể đăng nhập lại.")}>
                Mở khoá tài khoản
              </button>
            ))}
        </div>
      )}
      <Dialog
        open={rolesOpen}
        onClose={() => setRolesOpen(false)}
        title={`Vai trò của ${user.email}`}
        size="sm"
        footer={
          <Button
            loading={loading}
            disabled={!picked.length}
            onClick={async () => {
              if ((await run(() => apiFetch(`/api/admin/users/${user.id}`, { method: "PATCH", body: { action: "set_roles", roleIds: picked } }), "Đã cập nhật vai trò")) !== undefined) setRolesOpen(false);
            }}
          >
            Lưu
          </Button>
        }
      >
        <div className="space-y-2">
          {roles.map((r) => (
            <Checkbox key={r.value} label={r.label} checked={picked.includes(r.value)} onChange={(e) => setPicked((s) => (e.target.checked ? [...s, r.value] : s.filter((x) => x !== r.value)))} className="flex" />
          ))}
        </div>
      </Dialog>
      {temp && <TempPassword email={user.email} password={temp} onClose={() => setTemp(null)} />}
    </div>
  );
}
