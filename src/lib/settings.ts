// Cấu hình doanh nghiệp lưu trong bảng company_settings (key → JSON), có giá trị mặc định và kiểm tra bằng zod.
import { z } from "zod";
import { prisma } from "./db";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ dạng HH:mm");

export const settingSchemas = {
  company: z.object({
    name: z.string().min(1).max(200),
    shortName: z.string().max(50).default(""),
    taxCode: z.string().max(20).default(""),
    address: z.string().max(300).default(""),
    phone: z.string().max(30).default(""),
    email: z.string().max(120).default(""),
    industry: z.string().max(120).default(""),
    logoFileId: z.string().nullable().default(null),
  }),
  attendance: z.object({
    workingDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
    defaultShiftId: z.string().nullable().default(null),
    qrEnabled: z.boolean().default(true),
    gpsEnabled: z.boolean().default(false),
    gpsConsentText: z.string().max(1000).default(
      "Khi bật, hệ thống ghi nhận vị trí GPS tại thời điểm chấm công để xác minh bạn đang ở chi nhánh. Dữ liệu chỉ dùng cho mục đích chấm công.",
    ),
    allowWebCheckin: z.boolean().default(true),
    missingCheckoutPolicy: z.enum(["ZERO", "HALF"]).default("ZERO"),
    missingCheckinReminderAt: time.default("10:00"),
  }),
  leave: z.object({
    annualBaseDays: z.number().min(0).max(60).default(12),
    seniorityStepYears: z.number().int().min(1).max(50).default(5),
    seniorityExtraDays: z.number().min(0).max(10).default(1),
    prorateFirstYear: z.boolean().default(true),
    allowNegativeBalance: z.boolean().default(false),
    twoLevelMinDays: z.number().min(0).max(365).default(3),
    maxCarryOverDays: z.number().min(0).max(60).default(0),
    legalReviewNote: z.string().max(1000).default("Giá trị mặc định tham chiếu Điều 113–114 Bộ luật Lao động 2019 – cần HR/pháp chế rà soát trước khi vận hành."),
  }),
  overtime: z.object({
    maxHoursPerMonth: z.number().min(0).max(300).default(40),
    maxHoursPerYear: z.number().min(0).max(1000).default(200),
    approvalLevels: z.number().int().min(1).max(2).default(1),
  }),
  security: z.object({
    requireMfaForPrivileged: z.boolean().default(false),
    passwordMinLength: z.number().int().min(8).max(64).default(10),
    lockoutThreshold: z.number().int().min(3).max(20).default(5),
    lockoutMinutes: z.number().int().min(1).max(1440).default(15),
  }),
  notifications: z.object({
    contractExpiryDays: z.number().int().min(1).max(180).default(30),
    birthdayEnabled: z.boolean().default(true),
    missingCheckinEnabled: z.boolean().default(true),
    probationEndDays: z.number().int().min(1).max(60).default(14),
    emailEnabled: z.boolean().default(false),
  }),
  templates: z.object({
    interviewInvite: z.string().max(5000).default(
      "Chào {ten_ung_vien},\n\n{ten_cong_ty} trân trọng mời bạn tham gia phỏng vấn vị trí {vi_tri} vào lúc {thoi_gian} tại {dia_diem}.\n\nVui lòng xác nhận tham dự. Trân trọng.",
    ),
    offer: z.string().max(5000).default(
      "Chào {ten_ung_vien},\n\nChúc mừng bạn đã trúng tuyển vị trí {vi_tri} tại {ten_cong_ty}. Bộ phận Nhân sự sẽ liên hệ để thống nhất ngày nhận việc.\n\nTrân trọng.",
    ),
    rejection: z.string().max(5000).default(
      "Chào {ten_ung_vien},\n\nCảm ơn bạn đã quan tâm đến vị trí {vi_tri} tại {ten_cong_ty}. Rất tiếc hồ sơ của bạn chưa phù hợp ở thời điểm này.\n\nTrân trọng.",
    ),
    onboardingTasks: z
      .array(z.object({ title: z.string(), category: z.string() }))
      .default([
        { title: "Thu thập CCCD, sổ BHXH, ảnh thẻ, bằng cấp", category: "DOCUMENT" },
        { title: "Ký hợp đồng thử việc / lao động", category: "DOCUMENT" },
        { title: "Cấp tài khoản HRM và email công ty", category: "ACCOUNT" },
        { title: "Bàn giao laptop / thiết bị", category: "EQUIPMENT" },
        { title: "Giới thiệu nội quy, văn hoá công ty", category: "TRAINING" },
        { title: "Đào tạo nghiệp vụ với người hướng dẫn", category: "TRAINING" },
        { title: "Đánh giá cuối thử việc", category: "REVIEW" },
      ]),
    offboardingTasks: z
      .array(z.object({ title: z.string(), category: z.string() }))
      .default([
        { title: "Nhận đơn xin nghỉ việc / quyết định chấm dứt HĐLĐ", category: "DOCUMENT" },
        { title: "Bàn giao công việc, hồ sơ đang xử lý", category: "HANDOVER" },
        { title: "Thu hồi laptop, thiết bị, thẻ ra vào", category: "ASSET_RETURN" },
        { title: "Thu hồi tài khoản email, phần mềm, HRM", category: "ACCESS_REVOKE" },
        { title: "Chốt công, phép tồn, quyết toán lương", category: "FINAL_SETTLEMENT" },
        { title: "Chốt sổ BHXH, trả hồ sơ", category: "DOCUMENT" },
      ]),
  }),
} as const;

export type SettingKey = keyof typeof settingSchemas;
export type SettingValue<K extends SettingKey> = z.output<(typeof settingSchemas)[K]>;

const DEFAULT_COMPANY_NAME = "Công ty của bạn";

export function defaultSetting<K extends SettingKey>(key: K): SettingValue<K> {
  const base = key === "company" ? { name: DEFAULT_COMPANY_NAME } : {};
  return settingSchemas[key].parse(base) as SettingValue<K>;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await prisma.companySetting.findUnique({ where: { key } });
  const merged = { ...(defaultSetting(key) as object), ...((row?.value as object) ?? {}) };
  const parsed = settingSchemas[key].safeParse(merged);
  return (parsed.success ? parsed.data : defaultSetting(key)) as SettingValue<K>;
}

export async function saveSetting<K extends SettingKey>(key: K, value: unknown, userId: string | null): Promise<SettingValue<K>> {
  const current = await getSetting(key);
  const parsed = settingSchemas[key].parse({ ...(current as object), ...(value as object) }) as SettingValue<K>;
  await prisma.companySetting.upsert({
    where: { key },
    create: { key, value: parsed as object, updatedById: userId },
    update: { value: parsed as object, updatedById: userId },
  });
  return parsed;
}
