// Nhập nhân viên từ Excel: GET = tải file mẫu; POST (multipart: file, commit=0|1) = kiểm tra / nhập.
// Toàn bộ file được kiểm tra trước; chỉ nhập khi không có dòng lỗi (giao dịch tất cả hoặc không gì cả).
import { prisma } from "@/lib/db";
import { api, fileResponse } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { buildWorkbook, readFirstSheet, XLSX_MIME } from "@/lib/excel";
import { buildSearchText, createEmployeeSchema } from "@/lib/services/employee";
import { blindIndex, encrypt } from "@/lib/crypto";
import { dbDate } from "@/lib/dates";
import { HttpError } from "@/lib/errors";
import { nextEmployeeCode } from "@/lib/sequence";
import { audit } from "@/lib/audit";
import { saveUpload } from "@/lib/storage";

const COLS = [
  { header: "Họ tên*", key: "fullName" },
  { header: "Email", key: "email" },
  { header: "Điện thoại", key: "phone" },
  { header: "Mã phòng ban", key: "department" },
  { header: "Mã chức vụ", key: "position" },
  { header: "Mã chi nhánh", key: "branch" },
  { header: "Mã NV quản lý", key: "manager" },
  { header: "Ngày vào làm* (YYYY-MM-DD)", key: "startDate" },
  { header: "Trạng thái (PROBATION/ACTIVE)", key: "status" },
  { header: "Ngày sinh (YYYY-MM-DD)", key: "dateOfBirth" },
  { header: "Giới tính (MALE/FEMALE/OTHER)", key: "gender" },
  { header: "Địa chỉ", key: "address" },
  { header: "Số CCCD", key: "nationalId" },
];

export const GET = api(async (_req, { ctx }) => {
  requirePerm(ctx, "employee.create", "COMPANY");
  const [depts, positions, branches] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, select: { code: true, name: true } }),
    prisma.position.findMany({ where: { isActive: true }, select: { code: true, name: true } }),
    prisma.branch.findMany({ where: { isActive: true }, select: { code: true, name: true } }),
  ]);
  const buf = await buildWorkbook([
    {
      name: "Nhân viên",
      columns: COLS.map((c) => ({ header: c.header, key: c.key, width: 22 })),
      rows: [{ fullName: "Nguyễn Văn Mẫu", email: "mau@congty.vn", phone: "0901234567", department: depts[0]?.code ?? "", startDate: "2026-12-01", status: "PROBATION", gender: "MALE" }],
    },
    { name: "Mã phòng ban", columns: [{ header: "Mã", key: "code" }, { header: "Tên", key: "name", width: 30 }], rows: depts },
    { name: "Mã chức vụ", columns: [{ header: "Mã", key: "code" }, { header: "Tên", key: "name", width: 30 }], rows: positions },
    { name: "Mã chi nhánh", columns: [{ header: "Mã", key: "code" }, { header: "Tên", key: "name", width: 30 }], rows: branches },
  ]);
  return fileResponse(buf, "mau-nhap-nhan-vien.xlsx", XLSX_MIME);
});

export const POST = api(async (req, { ctx }) => {
  requirePerm(ctx, "employee.create", "COMPANY");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Chọn file Excel (.xlsx)");
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new HttpError(400, "Chỉ hỗ trợ file .xlsx");
  const commit = form?.get("commit") === "1";
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) throw new HttpError(400, "File vượt quá 5MB");
  const { headers, rows } = await readFirstSheet(buf).catch(() => {
    throw new HttpError(400, "Không đọc được file Excel");
  });
  const missing = COLS.filter((c) => c.header.endsWith("*") || c.header.includes("*")).filter((c) => !headers.includes(c.header));
  if (missing.length) throw new HttpError(400, `Thiếu cột bắt buộc: ${missing.map((m) => m.header).join(", ")}. Hãy dùng file mẫu.`);
  if (rows.length === 0) throw new HttpError(400, "File không có dòng dữ liệu");
  if (rows.length > 2000) throw new HttpError(400, "Tối đa 2000 dòng mỗi lần nhập");

  const [depts, positions, branches, managers, existing] = await Promise.all([
    prisma.department.findMany({ select: { id: true, code: true } }),
    prisma.position.findMany({ select: { id: true, code: true } }),
    prisma.branch.findMany({ select: { id: true, code: true } }),
    prisma.employee.findMany({ select: { id: true, code: true } }),
    prisma.employee.findMany({ select: { email: true, nationalIdHash: true } }),
  ]);
  const byCode = <T extends { id: string; code: string }>(list: T[]) => new Map(list.map((x) => [x.code.toUpperCase(), x.id]));
  const D = byCode(depts), P = byCode(positions), B = byCode(branches), M = byCode(managers);
  const emails = new Set(existing.map((e) => e.email).filter(Boolean));
  const nids = new Set(existing.map((e) => e.nationalIdHash).filter(Boolean));

  const errors: { row: number; message: string }[] = [];
  const valid: { data: ReturnType<typeof createEmployeeSchema.parse>; nidHash: string | null }[] = [];
  for (const r of rows) {
    const v: Record<string, string> = {};
    for (const c of COLS) v[c.key] = r.values[c.header] ?? "";
    const rowErr: string[] = [];
    const ref = (map: Map<string, string>, code: string, label: string) => {
      if (!code) return null;
      const id = map.get(code.toUpperCase());
      if (!id) rowErr.push(`${label} "${code}" không tồn tại`);
      return id ?? null;
    };
    const parsed = createEmployeeSchema.safeParse({
      fullName: v.fullName,
      email: v.email || null,
      phone: v.phone || null,
      departmentId: ref(D, v.department, "Phòng ban"),
      positionId: ref(P, v.position, "Chức vụ"),
      branchId: ref(B, v.branch, "Chi nhánh"),
      managerId: ref(M, v.manager, "Quản lý"),
      startDate: v.startDate,
      status: v.status || "PROBATION",
      dateOfBirth: v.dateOfBirth || null,
      gender: v.gender || "UNDISCLOSED",
      address: v.address || null,
      nationalId: v.nationalId || null,
    });
    if (!parsed.success) rowErr.push(...parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    const nidHash = blindIndex(v.nationalId || null);
    if (v.email) {
      if (emails.has(v.email.toLowerCase())) rowErr.push(`Email ${v.email} đã tồn tại`);
      emails.add(v.email.toLowerCase());
    }
    if (nidHash) {
      if (nids.has(nidHash)) rowErr.push("Số CCCD trùng với hồ sơ đã có hoặc dòng khác");
      nids.add(nidHash);
    }
    if (rowErr.length) errors.push({ row: r.rowNumber, message: rowErr.join("; ") });
    else if (parsed.success) valid.push({ data: parsed.data, nidHash });
  }

  if (!commit || errors.length) {
    return { total: rows.length, valid: valid.length, errors, committed: false };
  }
  const stored = await saveUpload(file);
  await prisma.$transaction(
    async (tx) => {
      for (const { data: d, nidHash } of valid) {
        const code = await nextEmployeeCode(tx);
        await tx.employee.create({
          data: {
            code,
            fullName: d.fullName,
            email: d.email ?? null,
            phone: d.phone ?? null,
            departmentId: d.departmentId ?? null,
            positionId: d.positionId ?? null,
            branchId: d.branchId ?? null,
            managerId: d.managerId ?? null,
            startDate: dbDate(d.startDate),
            status: d.status,
            employmentType: d.employmentType,
            dateOfBirth: d.dateOfBirth ? dbDate(d.dateOfBirth) : null,
            gender: d.gender ?? "UNDISCLOSED",
            address: d.address ?? null,
            nationalIdEnc: encrypt(d.nationalId ?? null),
            nationalIdHash: nidHash,
            searchText: buildSearchText({ fullName: d.fullName, code, email: d.email, phone: d.phone }),
          },
        });
      }
      await tx.employeeDocument.create({ data: { category: "OTHER", uploadedById: ctx.userId, ...stored } });
      await audit(ctx, { action: "IMPORT", entityType: "Employee", summary: `Nhập ${valid.length} nhân viên từ Excel "${stored.fileName}"` }, req, tx);
    },
    { timeout: 120_000 },
  );
  return { total: rows.length, valid: valid.length, errors: [], committed: true };
});
