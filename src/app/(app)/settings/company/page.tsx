import { prisma } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/rbac";
import { getSetting } from "@/lib/settings";
import { spGet, type SP } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Notice, PageHeader, Tabs } from "@/components/ui/misc";
import { SettingsForm, type SettingField } from "../settings-form";
import { LogoUpload } from "./logo-upload";

export const metadata = { title: "Cấu hình doanh nghiệp" };

export default async function CompanySettingsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePageAuth();
  const canSys = can(ctx, "admin_setting.view");
  const canLeave = can(ctx, "leave.update", "COMPANY");
  if (!canSys && !canLeave) redirect("/forbidden");
  const editSys = can(ctx, "admin_setting.update");
  const tab = spGet(await searchParams, "tab") ?? (canSys ? "company" : "leave");
  const tabs = [
    ...(canSys ? [{ key: "company", label: "Doanh nghiệp", href: "?tab=company" }, { key: "attendance", label: "Quy tắc chấm công", href: "?tab=attendance" }] : []),
    { key: "leave", label: "Chính sách phép", href: "?tab=leave" },
    ...(canSys
      ? [
          { key: "overtime", label: "Tăng ca", href: "?tab=overtime" },
          { key: "security", label: "Bảo mật", href: "?tab=security" },
          { key: "notifications", label: "Thông báo", href: "?tab=notifications" },
          { key: "templates", label: "Mẫu thông báo", href: "?tab=templates" },
        ]
      : []),
  ];

  let content: React.ReactNode = null;
  if (tab === "company" && canSys) {
    const v = await getSetting("company");
    content = (
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Thông tin doanh nghiệp" />
          <CardContent>
            <SettingsForm
              settingKey="company"
              readOnly={!editSys}
              initial={v}
              fields={[
                { key: "name", label: "Tên doanh nghiệp", type: "text", full: true },
                { key: "shortName", label: "Tên viết tắt", type: "text", hint: "Hiển thị trên menu, ứng dụng xác thực" },
                { key: "taxCode", label: "Mã số thuế", type: "text" },
                { key: "industry", label: "Ngành nghề", type: "text" },
                { key: "phone", label: "Điện thoại", type: "text" },
                { key: "email", label: "Email", type: "text" },
                { key: "address", label: "Địa chỉ", type: "text", full: true },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="Logo" />
          <CardContent>{editSys ? <LogoUpload logoFileId={v.logoFileId} /> : <p className="text-sm text-muted-foreground">Không có quyền sửa</p>}</CardContent>
        </Card>
      </div>
    );
  } else if (tab === "attendance" && canSys) {
    const v = await getSetting("attendance");
    const shifts = await prisma.workShift.findMany({ where: { isActive: true }, orderBy: { startTime: "asc" } });
    content = (
      <Card>
        <CardHeader title="Quy tắc chấm công" description="Áp dụng cho nhân viên không được phân ca riêng" />
        <CardContent>
          <SettingsForm
            settingKey="attendance"
            readOnly={!editSys}
            initial={v}
            fields={[
              { key: "workingDays", label: "Ngày làm việc trong tuần", type: "weekdays" },
              { key: "defaultShiftId", label: "Ca mặc định", type: "select", options: shifts.map((s) => ({ value: s.id, label: `${s.name} (${s.startTime}–${s.endTime})` })) },
              { key: "missingCheckoutPolicy", label: "Xử lý khi thiếu giờ vào/ra", type: "select", options: [{ value: "ZERO", label: "Tính 0 công (chờ điều chỉnh)" }, { value: "HALF", label: "Tính 1/2 công" }] },
              { key: "missingCheckinReminderAt", label: "Giờ nhắc chưa chấm công", type: "time" },
              { key: "allowWebCheckin", label: "Cho phép chấm công bằng nút bấm trên web/điện thoại", type: "boolean" },
              { key: "qrEnabled", label: "Bật chấm công bằng mã QR (mã đổi mỗi 60 giây)", type: "boolean" },
              { key: "gpsEnabled", label: "Bật chấm công theo vị trí GPS", type: "boolean", hint: "Chỉ bật khi doanh nghiệp có cơ sở pháp lý và đã thông báo cho nhân viên (Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân). Cần cấu hình toạ độ chi nhánh." },
              { key: "gpsConsentText", label: "Thông báo cho nhân viên khi chấm công GPS", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    );
  } else if (tab === "leave") {
    const v = await getSetting("leave");
    content = (
      <Card>
        <CardHeader title="Chính sách nghỉ phép" />
        <CardContent className="space-y-4">
          <Notice tone="warning">Giá trị mặc định tham chiếu BLLĐ 2019 (Điều 113–114) nhưng chưa được xác minh pháp lý. Vui lòng rà soát với quy định hiện hành, thoả ước lao động và nội quy công ty.</Notice>
          <SettingsForm
            settingKey="leave"
            readOnly={!canLeave}
            initial={v}
            fields={[
              { key: "annualBaseDays", label: "Số ngày phép năm cơ bản", type: "number", min: 0, max: 60, step: 0.5 },
              { key: "seniorityStepYears", label: "Mỗi bao nhiêu năm thâm niên được cộng thêm", type: "number", min: 1, max: 50 },
              { key: "seniorityExtraDays", label: "Số ngày cộng thêm theo thâm niên", type: "number", min: 0, max: 10, step: 0.5 },
              { key: "maxCarryOverDays", label: "Tối đa ngày phép chuyển sang năm sau", type: "number", min: 0, max: 60 },
              { key: "twoLevelMinDays", label: "Đơn từ bao nhiêu ngày cần duyệt 2 cấp (0 = luôn 1 cấp)", type: "number", min: 0, max: 365, hint: "Cấp 1: quản lý trực tiếp/trưởng phòng; cấp 2: HR/Ban giám đốc" },
              { key: "prorateFirstYear", label: "Năm đầu tính phép theo tỷ lệ số tháng làm việc", type: "boolean" },
              { key: "allowNegativeBalance", label: "Cho phép nghỉ vượt số ngày phép (âm phép)", type: "boolean" },
              { key: "legalReviewNote", label: "Ghi chú rà soát pháp lý", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    );
  } else if (tab === "overtime" && canSys) {
    content = (
      <Card>
        <CardHeader title="Chính sách tăng ca" description="Hệ thống cảnh báo khi vượt giới hạn; hệ số lương tăng ca cấu hình trong Cấu hình lương" />
        <CardContent>
          <SettingsForm
            settingKey="overtime"
            readOnly={!editSys}
            initial={await getSetting("overtime")}
            fields={[
              { key: "maxHoursPerMonth", label: "Giới hạn giờ tăng ca / tháng (cảnh báo)", type: "number", min: 0, max: 300 },
              { key: "maxHoursPerYear", label: "Giới hạn giờ tăng ca / năm (cảnh báo)", type: "number", min: 0, max: 1000 },
              { key: "approvalLevels", label: "Số cấp duyệt", type: "select", options: [{ value: "1", label: "1 cấp" }, { value: "2", label: "2 cấp" }] },
            ]}
          />
        </CardContent>
      </Card>
    );
  } else if (tab === "security" && canSys) {
    content = (
      <Card>
        <CardHeader title="Bảo mật" />
        <CardContent>
          <SettingsForm
            settingKey="security"
            readOnly={!editSys}
            initial={await getSetting("security")}
            fields={[
              { key: "requireMfaForPrivileged", label: "Bắt buộc xác thực hai lớp cho tài khoản đặc quyền (Super Admin, HR, Kế toán lương, Ban giám đốc)", type: "boolean", hint: "Khuyến nghị bật khi triển khai Production" },
              { key: "passwordMinLength", label: "Độ dài mật khẩu tối thiểu", type: "number", min: 8, max: 64 },
              { key: "lockoutThreshold", label: "Khoá tạm sau số lần đăng nhập sai", type: "number", min: 3, max: 20 },
              { key: "lockoutMinutes", label: "Thời gian khoá tạm (phút)", type: "number", min: 1, max: 1440 },
            ]}
          />
        </CardContent>
      </Card>
    );
  } else if (tab === "notifications" && canSys) {
    content = (
      <Card>
        <CardHeader title="Thông báo tự động" description="Thông báo trong ứng dụng luôn bật. Email/kênh ngoài chưa được tích hợp trong phiên bản này." />
        <CardContent>
          <SettingsForm
            settingKey="notifications"
            readOnly={!editSys}
            initial={await getSetting("notifications")}
            fields={[
              { key: "contractExpiryDays", label: "Cảnh báo hợp đồng hết hạn trước (ngày)", type: "number", min: 1, max: 180 },
              { key: "probationEndDays", label: "Cảnh báo hết thử việc trước (ngày)", type: "number", min: 1, max: 60 },
              { key: "birthdayEnabled", label: "Thông báo sinh nhật nhân viên", type: "boolean" },
              { key: "missingCheckinEnabled", label: "Nhắc nhân viên chưa chấm công / thiếu giờ ra", type: "boolean" },
            ]}
          />
        </CardContent>
      </Card>
    );
  } else if (tab === "templates" && canSys) {
    content = (
      <Card>
        <CardHeader title="Mẫu thông báo tuyển dụng" description="Biến: {ten_ung_vien}, {vi_tri}, {ten_cong_ty}, {thoi_gian}, {dia_diem}" />
        <CardContent>
          <SettingsForm
            settingKey="templates"
            readOnly={!editSys}
            initial={await getSetting("templates")}
            fields={[
              { key: "interviewInvite", label: "Thư mời phỏng vấn", type: "textarea" },
              { key: "offer", label: "Thư mời nhận việc", type: "textarea" },
              { key: "rejection", label: "Thư cảm ơn / từ chối", type: "textarea" },
            ]}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader title="Cấu hình doanh nghiệp" back={{ href: "/settings", label: "Cài đặt" }} />
      <Tabs items={tabs} active={tab} />
      {content}
    </div>
  );
}
