import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, parseBody } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { HttpError } from "@/lib/errors";
import { getSetting } from "@/lib/settings";
import { verifyQrToken } from "@/lib/qr";
import { checkIn, checkOut, haversineMeters } from "@/lib/services/attendance";
import { audit } from "@/lib/audit";
import { fmtTime } from "@/lib/format";

const schema = z.object({
  type: z.enum(["in", "out"]),
  method: z.enum(["WEB", "QR", "GPS"]),
  qrToken: z.string().max(200).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

/** Nhân viên tự chấm công vào/ra */
export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "attendance.create");
  if (!ctx.employee) throw new HttpError(400, "Tài khoản chưa liên kết hồ sơ nhân viên");
  const b = await parseBody(req, schema);
  const settings = await getSetting("attendance");
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: ctx.employee.id }, include: { branch: true } });
  if (emp.deactivatedAt || emp.status === "RESIGNED") throw new HttpError(403, "Hồ sơ không còn hoạt động");

  let lat: number | null = null;
  let lng: number | null = null;
  if (b.method === "QR") {
    if (!settings.qrEnabled) throw new HttpError(400, "Chấm công QR chưa được bật");
    const v = b.qrToken ? verifyQrToken(b.qrToken) : { ok: false as const };
    if (!v.ok) throw new HttpError(400, "Mã QR không hợp lệ hoặc đã hết hạn – vui lòng quét lại");
    if (v.branchId && emp.branchId && v.branchId !== emp.branchId) throw new HttpError(400, "Mã QR thuộc chi nhánh khác");
  } else if (b.method === "GPS") {
    if (!settings.gpsEnabled) throw new HttpError(400, "Chấm công GPS chưa được bật");
    if (b.lat == null || b.lng == null) throw new HttpError(400, "Không lấy được vị trí – hãy cho phép trình duyệt truy cập vị trí");
    const br = emp.branch;
    if (!br?.latitude || !br?.longitude) throw new HttpError(400, "Chi nhánh của bạn chưa cấu hình toạ độ GPS");
    const dist = haversineMeters(b.lat, b.lng, br.latitude, br.longitude);
    if (dist > br.gpsRadiusM) throw new HttpError(400, `Bạn đang ở ngoài phạm vi chấm công (cách chi nhánh khoảng ${Math.round(dist)} m)`);
    lat = b.lat;
    lng = b.lng;
  } else if (!settings.allowWebCheckin) {
    throw new HttpError(400, "Công ty yêu cầu chấm công bằng QR hoặc GPS");
  }

  const rec = b.type === "in" ? await checkIn(ctx.employee.id, { method: b.method, lat, lng }) : await checkOut(ctx.employee.id, { method: b.method, lat, lng });
  await audit(ctx, { action: b.type === "in" ? "CHECK_IN" : "CHECK_OUT", entityType: "Attendance", entityId: rec.id, summary: `${b.type === "in" ? "Vào ca" : "Ra ca"} (${b.method})` }, req);
  return {
    workDate: rec.workDate.toISOString().slice(0, 10),
    checkIn: rec.checkInAt ? fmtTime(rec.checkInAt) : null,
    checkOut: rec.checkOutAt ? fmtTime(rec.checkOutAt) : null,
    lateMinutes: rec.lateMinutes,
    earlyMinutes: rec.earlyMinutes,
    workdayValue: rec.workdayValue,
  };
});
