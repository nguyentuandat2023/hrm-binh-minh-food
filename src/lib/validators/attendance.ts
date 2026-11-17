import { z } from "zod";
import { isDateKey, isHHmm } from "../dates";

export const shiftSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{1,20}$/, "Mã ca không hợp lệ"),
  name: z.string().trim().min(2).max(80),
  startTime: z.string().refine(isHHmm, "Giờ bắt đầu HH:mm"),
  endTime: z.string().refine(isHHmm, "Giờ kết thúc HH:mm"),
  breakMinutes: z.number().int().min(0).max(240).default(60),
  graceLateMinutes: z.number().int().min(0).max(120).default(5),
  graceEarlyMinutes: z.number().int().min(0).max(120).default(5),
  workdayValue: z.number().min(0.1).max(2).default(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0f766e"),
});

export const assignmentSchema = z.object({
  employeeIds: z.array(z.string()).min(1, "Chọn nhân viên").max(500),
  shiftId: z.string().nullable(), // null = ngày nghỉ
  startDate: z.string().refine(isDateKey, "Ngày bắt đầu không hợp lệ"),
  endDate: z.string().refine(isDateKey, "Ngày kết thúc không hợp lệ").nullable().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  note: z.string().trim().max(200).nullable().optional(),
});
