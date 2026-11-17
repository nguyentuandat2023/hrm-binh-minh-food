import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { requirePagePerm } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fmtDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton } from "@/components/form-dialog";

export const metadata = { title: "Sao lưu & khôi phục" };

async function listBackups() {
  const dir = path.resolve(process.env.BACKUP_DIR || "./backups");
  try {
    const names = await readdir(dir);
    const files = await Promise.all(
      names.filter((n) => /\.(dump|sql|gz|zip|tar)$/i.test(n)).map(async (n) => {
        const s = await stat(path.join(dir, n));
        return { name: n, size: s.size, mtime: s.mtime };
      }),
    );
    return { dir, files: files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime()).slice(0, 30), error: null };
  } catch {
    return { dir, files: [], error: "Thư mục sao lưu chưa tồn tại hoặc không đọc được" };
  }
}

export default async function BackupPage() {
  const ctx = await requirePagePerm("admin_backup.view");
  const [b, jobs] = await Promise.all([listBackups(), prisma.auditLog.findMany({ where: { action: "JOB_RUN" }, orderBy: { createdAt: "desc" }, take: 5 })]);
  const latest = b.files[0];
  const stale = !latest || Date.now() - latest.mtime.getTime() > 36 * 3600_000;
  return (
    <div className="space-y-5">
      <PageHeader back={{ href: "/settings", label: "Cài đặt" }} title="Sao lưu & khôi phục" />
      {stale && <Notice tone="danger">Chưa có bản sao lưu trong 36 giờ qua tại thư mục sao lưu. Kiểm tra lịch sao lưu (cron) trên máy chủ.</Notice>}
      <Card>
        <CardHeader title="Bản sao lưu cơ sở dữ liệu" description={`Thư mục: ${b.dir}`} />
        {b.files.length === 0 ? (
          <EmptyState title="Chưa có bản sao lưu" description={b.error ?? "Chạy scripts/backup.sh (Docker) hoặc npm run backup để tạo bản sao lưu."} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Tệp</TH>
                <TH className="text-right">Dung lượng</TH>
                <TH>Thời gian</TH>
              </tr>
            </THead>
            <TBody>
              {b.files.map((f) => (
                <TR key={f.name}>
                  <TD className="font-mono text-xs">{f.name}</TD>
                  <TD className="tabular text-right">{(f.size / 1024 / 1024).toFixed(2)} MB</TD>
                  <TD className="text-xs">{fmtDateTime(f.mtime)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Quy trình sao lưu & khôi phục" />
        <CardContent className="space-y-3 text-sm">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <b>Sao lưu hằng ngày</b>: cron trên máy chủ chạy <code>scripts/backup.sh</code> (pg_dump định dạng custom + nén thư mục file đính kèm), giữ 14 bản gần nhất.
            </li>
            <li>
              <b>Lưu trữ ngoài máy chủ</b>: đồng bộ thư mục sao lưu sang kho lưu trữ khác (NAS/cloud) có mã hoá; giới hạn quyền truy cập cho quản trị hệ thống.
            </li>
            <li>
              <b>Khoá mã hoá</b>: <code>DATA_ENCRYPTION_KEY</code> phải được sao lưu <u>tách biệt</u> với bản sao lưu DB. Mất khoá = không giải mã được CCCD, số tài khoản.
            </li>
            <li>
              <b>Kiểm tra khôi phục</b> hằng tháng: chạy <code>scripts/restore-test.sh &lt;file.dump&gt;</code> – khôi phục vào database tạm, đếm bản ghi, rồi xoá database tạm. Ghi kết quả vào biên bản.
            </li>
          </ol>
          <p className="text-muted-foreground">Chi tiết: docs/TRIEN_KHAI.md, mục “Sao lưu & khôi phục”.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Tác vụ tự động gần đây" description="Thông báo hợp đồng, sinh nhật, thiếu chấm công, nhắc duyệt…" actions={can(ctx, "admin_setting.update") && <ActionButton url="/api/admin/jobs" label="Chạy ngay" successMessage="Đã chạy tác vụ tự động" />} />
        <CardContent className="space-y-2 text-sm">
          {jobs.length === 0 && <p className="text-muted-foreground">Chưa chạy lần nào</p>}
          {jobs.map((j) => (
            <p key={j.id}>
              <span className="tabular text-xs text-muted-foreground">{fmtDateTime(j.createdAt)}</span> – {j.summary}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
