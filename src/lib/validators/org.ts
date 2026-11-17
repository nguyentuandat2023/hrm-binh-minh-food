import { z } from "zod";

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{2,20}$/, "Mã 2–20 ký tự (chữ, số, -, _)");

export const deptSchema = z.object({
  code,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  parentId: z.string().nullable().optional(),
  branchId: z.string().nullable().optional(),
  headId: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).default(0),
});

export const branchSchema = z.object({
  code,
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(300).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  gpsRadiusM: z.number().int().min(20).max(5000).default(200),
});

export const positionSchema = z.object({
  code,
  name: z.string().trim().min(2).max(120),
  level: z.number().int().min(1).max(20).default(1),
  departmentId: z.string().nullable().optional(),
});
