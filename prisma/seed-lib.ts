// Dữ liệu nền bắt buộc (dùng cho cả Production): quyền, vai trò, loại nghỉ, ca mặc định, cấu hình.
// KHÔNG tạo nhân viên/tài khoản – tài khoản quản trị đầu tiên tạo bằng `npm run create-admin`.
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_ROLE_MATRIX, MODULES, SYSTEM_ROLES } from "../src/lib/permissions";
import { unaccent } from "../src/lib/format";

export async function seedBaseline(prisma: PrismaClient) {
  // 1. Quyền
  for (const m of MODULES) {
    for (const [action, description] of Object.entries(m.actions)) {
      const key = `${m.key}.${action}`;
      await prisma.permission.upsert({
        where: { key },
        create: { key, module: m.key, action, description: description! },
        update: { module: m.key, action, description: description! },
      });
    }
  }
  const perms = await prisma.permission.findMany();
  const permId = new Map(perms.map((p) => [p.key, p.id]));

  // 2. Vai trò hệ thống + ma trận mặc định (chỉ gán khi vai trò mới được tạo, không ghi đè tuỳ chỉnh)
  for (const r of SYSTEM_ROLES) {
    const existing = await prisma.role.findUnique({ where: { key: r.key } });
    const role = existing ?? (await prisma.role.create({ data: { key: r.key, name: r.name, description: r.description, isSystem: true } }));
    if (!existing || r.key === "SUPER_ADMIN") {
      const matrix = DEFAULT_ROLE_MATRIX[r.key];
      for (const [key, scope] of Object.entries(matrix)) {
        const pid = permId.get(key);
        if (!pid) continue;
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: pid } },
          create: { roleId: role.id, permissionId: pid, scope },
          update: r.key === "SUPER_ADMIN" ? { scope } : {},
        });
      }
    }
  }

  // 3. Ca làm việc mặc định
  const shifts = [
    { code: "HC", name: "Hành chính", startTime: "08:00", endTime: "17:00", breakMinutes: 60, color: "#0f766e" },
    { code: "SANG", name: "Ca sáng", startTime: "06:00", endTime: "14:00", breakMinutes: 30, color: "#ca8a04" },
    { code: "CHIEU", name: "Ca chiều", startTime: "14:00", endTime: "22:00", breakMinutes: 30, color: "#ea580c" },
    { code: "DEM", name: "Ca đêm (qua đêm)", startTime: "22:00", endTime: "06:00", breakMinutes: 30, color: "#4f46e5" },
  ];
  for (const s of shifts) await prisma.workShift.upsert({ where: { code: s.code }, create: s, update: {} });
  const hc = await prisma.workShift.findUniqueOrThrow({ where: { code: "HC" } });

  // 4. Loại nghỉ (giá trị mặc định – HR cần rà soát theo quy định hiện hành & nội quy công ty)
  const leaveTypes = [
    { code: "ANNUAL", name: "Nghỉ phép năm", isPaid: true, deductsBalance: true, defaultQuota: 12, color: "#2563eb" },
    { code: "SICK", name: "Nghỉ ốm (hưởng BHXH)", isPaid: false, deductsBalance: false, defaultQuota: 0, requiresAttachment: true, color: "#dc2626" },
    { code: "MARRIAGE", name: "Nghỉ kết hôn", isPaid: true, deductsBalance: true, defaultQuota: 3, color: "#db2777" },
    { code: "BEREAVEMENT", name: "Nghỉ tang", isPaid: true, deductsBalance: true, defaultQuota: 3, color: "#475569" },
    { code: "MATERNITY", name: "Nghỉ thai sản (hưởng BHXH)", isPaid: false, deductsBalance: false, defaultQuota: 0, requiresAttachment: true, color: "#9333ea" },
    { code: "UNPAID", name: "Nghỉ không lương", isPaid: false, deductsBalance: false, defaultQuota: 0, color: "#64748b" },
  ];
  for (const t of leaveTypes) await prisma.leaveType.upsert({ where: { code: t.code }, create: t, update: {} });

  // 5. Cấu hình
  const ensure = async (key: string, value: object) => {
    const row = await prisma.companySetting.findUnique({ where: { key } });
    if (!row) await prisma.companySetting.create({ data: { key, value } });
  };
  await ensure("attendance", { defaultShiftId: hc.id, workingDays: [1, 2, 3, 4, 5] });

  // 6. Ngày lễ dương lịch cố định 2026 (Tết Nguyên đán, Giỗ Tổ, ngày nghỉ liền kề 2/9 theo thông báo hằng năm – HR bổ sung)
  const holidays = [
    { date: "2026-01-01", name: "Tết Dương lịch" },
    { date: "2026-04-30", name: "Ngày Chiến thắng" },
    { date: "2026-05-01", name: "Quốc tế Lao động" },
    { date: "2026-09-02", name: "Quốc khánh" },
    { date: "2027-01-01", name: "Tết Dương lịch" },
  ];
  for (const h of holidays) {
    await prisma.holiday.upsert({ where: { date: new Date(h.date + "T00:00:00Z") }, create: { date: new Date(h.date + "T00:00:00Z"), name: h.name }, update: {} });
  }

  // 7. Bổ sung dữ liệu tìm kiếm không dấu cho hồ sơ cũ (idempotent)
  const missingSearch = await prisma.employee.findMany({ where: { searchText: "" }, select: { id: true, fullName: true, code: true, email: true, phone: true } });
  for (const e of missingSearch) {
    await prisma.employee.update({ where: { id: e.id }, data: { searchText: unaccent([e.fullName, e.code, e.email ?? "", e.phone ?? ""].join(" ")).toLowerCase() } });
  }

  // 8. Cấu hình lương mẫu ở trạng thái NHÁP – phải được xác minh & kích hoạt bởi người có thẩm quyền
  const anyConfig = await prisma.payrollConfig.findFirst();
  if (!anyConfig) {
    await prisma.payrollConfig.create({
      data: {
        version: 1,
        name: "Cấu hình mẫu (CHƯA XÁC MINH)",
        status: "DRAFT",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        params: {
          hoursPerDay: 8,
          standardWorkdaysMode: "SCHEDULED",
          fixedStandardWorkdays: 26,
          insurance: {
            employee: { bhxh: 0.08, bhyt: 0.015, bhtn: 0.01 },
            employer: { bhxh: 0.175, bhyt: 0.03, bhtn: 0.01 },
            capSocialHealth: 46800000,
            capUnemployment: 106200000,
            skipIfUnpaidDaysAtLeast: 14,
          },
          pit: {
            personalDeduction: 15500000,
            dependentDeduction: 6200000,
            brackets: [
              { upTo: 10000000, rate: 0.05 },
              { upTo: 30000000, rate: 0.1 },
              { upTo: 60000000, rate: 0.2 },
              { upTo: 100000000, rate: 0.3 },
              { upTo: null, rate: 0.35 },
            ],
            overtimePremiumExempt: true,
          },
          overtime: { weekday: 1.5, weekend: 2.0, holiday: 3.0 },
        },
        verifiedNote:
          "Giá trị do hệ thống điền sẵn để minh hoạ cấu trúc, CHƯA được đối chiếu văn bản pháp luật. Kế toán phải kiểm tra tỷ lệ BHXH/BHYT/BHTN, mức trần đóng, mức giảm trừ gia cảnh và biểu thuế TNCN đang áp dụng trước khi kích hoạt.",
      },
    });
  }
}
