import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma, type Tx } from "../db";
import { canAccessEmployee, employeeScopeWhere, type AuthCtx } from "../rbac";
import { blindIndex, decrypt, encrypt, mask } from "../crypto";
import { dbDate, isDateKey, keyOf } from "../dates";
import { unaccent } from "../format";
import { HttpError } from "../errors";
import { nextEmployeeCode } from "../sequence";
import { audit, diff } from "../audit";
import { notifyUsers, usersWithPerm } from "../notify";

// ------------------------- Validation -------------------------
const dateKey = z
  .string()
  .refine((s) => isDateKey(s), "Ngày không hợp lệ (YYYY-MM-DD)")
  .nullable()
  .optional();
const optStr = (max: number) => z.string().trim().max(max).nullable().optional();
const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-\s().]{8,20}$/, "Số điện thoại không hợp lệ")
  .nullable()
  .optional();

export const workInfoSchema = z.object({
  fullName: z.string().trim().min(2, "Nhập họ tên").max(120),
  email: z.string().trim().toLowerCase().email("Email không hợp lệ").max(200).nullable().optional(),
  phone,
  departmentId: z.string().nullable().optional(),
  positionId: z.string().nullable().optional(),
  managerId: z.string().nullable().optional(),
  branchId: z.string().nullable().optional(),
  startDate: z.string().refine((s) => isDateKey(s), "Nhập ngày bắt đầu làm việc"),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "INTERN", "SEASONAL", "CONTRACTOR"]).default("FULL_TIME"),
  status: z.enum(["PROBATION", "ACTIVE", "LEAVE_OF_ABSENCE", "RESIGNED"]).default("PROBATION"),
  probationEndDate: dateKey,
  endDate: dateKey,
});

export const privateInfoSchema = z.object({
  dateOfBirth: dateKey,
  gender: z.enum(["MALE", "FEMALE", "OTHER", "UNDISCLOSED"]).default("UNDISCLOSED"),
  address: optStr(300),
  nationalId: z
    .string()
    .trim()
    .regex(/^[0-9]{9,12}$/, "CCCD/CMND gồm 9–12 chữ số")
    .nullable()
    .optional(),
  emergencyName: optStr(120),
  emergencyPhone: phone,
  emergencyRelation: optStr(60),
});

export const createEmployeeSchema = workInfoSchema.merge(privateInfoSchema.partial()).extend({
  confirmDuplicate: z.boolean().optional(),
  baseSalary: z.number().int().min(0).max(2_000_000_000).nullable().optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export function buildSearchText(e: { fullName: string; code: string; email?: string | null; phone?: string | null }) {
  return unaccent([e.fullName, e.code, e.email ?? "", e.phone ?? ""].join(" ")).toLowerCase();
}

// ------------------------- Truy vấn -------------------------
export interface EmployeeFilters {
  q?: string;
  departmentId?: string;
  positionId?: string;
  branchId?: string;
  status?: string;
  includeInactive?: boolean;
}

export function employeeListWhere(ctx: AuthCtx, f: EmployeeFilters, permKey = "employee.view"): Prisma.EmployeeWhereInput {
  const and: Prisma.EmployeeWhereInput[] = [employeeScopeWhere(ctx, permKey)];
  if (f.q) {
    const terms = unaccent(f.q).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
    for (const t of terms) and.push({ searchText: { contains: t } });
  }
  if (f.departmentId) and.push({ departmentId: f.departmentId });
  if (f.positionId) and.push({ positionId: f.positionId });
  if (f.branchId) and.push({ branchId: f.branchId });
  if (f.status && ["PROBATION", "ACTIVE", "LEAVE_OF_ABSENCE", "RESIGNED"].includes(f.status)) and.push({ status: f.status as never });
  if (!f.includeInactive) and.push({ deactivatedAt: null });
  return { AND: and };
}

export const listSelect = {
  id: true,
  code: true,
  fullName: true,
  email: true,
  phone: true,
  status: true,
  startDate: true,
  avatarFileId: true,
  deactivatedAt: true,
  employmentType: true,
  department: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
  branch: { select: { id: true, name: true } },
  manager: { select: { id: true, fullName: true } },
} satisfies Prisma.EmployeeSelect;

export async function getEmployeeForCtx(ctx: AuthCtx, id: string, permKey = "employee.view") {
  const e = await prisma.employee.findUnique({ where: { id }, select: { id: true, departmentId: true, branchId: true, managerId: true, fullName: true } });
  if (!e) throw new HttpError(404, "Nhân viên không tồn tại");
  if (!canAccessEmployee(ctx, permKey, e)) throw new HttpError(403, "Bạn không có quyền truy cập hồ sơ này");
  return e;
}

/** Hồ sơ chi tiết – chỉ trả các nhóm thông tin user được phép xem */
export async function getEmployeeDetail(ctx: AuthCtx, id: string) {
  const ref = await getEmployeeForCtx(ctx, id);
  const allow = {
    private: canAccessEmployee(ctx, "employee_private.view", ref),
    salary: canAccessEmployee(ctx, "salary.view", ref),
    contracts: canAccessEmployee(ctx, "contract.view", ref),
    documents: canAccessEmployee(ctx, "document.view", ref),
    edit: canAccessEmployee(ctx, "employee.update", ref),
    editPrivate: canAccessEmployee(ctx, "employee_private.update", ref) && (ctx.perms["employee_private.update"] !== "SELF" || ctx.employee?.id === id),
    editSalary: canAccessEmployee(ctx, "salary.update", ref) && ctx.employee?.id !== id,
    deactivate: canAccessEmployee(ctx, "employee.delete", ref) && ctx.employee?.id !== id,
    manageContracts: canAccessEmployee(ctx, "contract.create", ref),
    uploadDocs: canAccessEmployee(ctx, "document.create", ref),
    deleteDocs: canAccessEmployee(ctx, "document.delete", ref),
    history: canAccessEmployee(ctx, "employee.update", ref),
  };
  const e = await prisma.employee.findUniqueOrThrow({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      position: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      manager: { select: { id: true, fullName: true, code: true } },
      user: { select: { id: true, email: true, isActive: true } },
      reports: { select: { id: true, fullName: true, code: true, avatarFileId: true }, where: { deactivatedAt: null } },
    },
  });
  const work = {
    id: e.id,
    code: e.code,
    fullName: e.fullName,
    avatarFileId: e.avatarFileId,
    email: e.email,
    phone: e.phone,
    department: e.department,
    position: e.position,
    branch: e.branch,
    manager: e.manager,
    reports: e.reports,
    startDate: keyOf(e.startDate),
    employmentType: e.employmentType,
    status: e.status,
    probationEndDate: keyOf(e.probationEndDate),
    endDate: keyOf(e.endDate),
    deactivatedAt: e.deactivatedAt?.toISOString() ?? null,
    hasAccount: !!e.user,
    accountActive: e.user?.isActive ?? false,
  };
  const priv = allow.private
    ? {
        dateOfBirth: keyOf(e.dateOfBirth),
        gender: e.gender,
        address: e.address,
        nationalId: decrypt(e.nationalIdEnc),
        emergencyName: e.emergencyName,
        emergencyPhone: e.emergencyPhone,
        emergencyRelation: e.emergencyRelation,
      }
    : null;

  const [salary, contracts, documents, history] = await Promise.all([
    allow.salary
      ? prisma.employee.findUniqueOrThrow({
          where: { id },
          select: { salaryProfile: true, allowances: { orderBy: { createdAt: "asc" } }, salaryAdjustments: { orderBy: { effectiveDate: "desc" } } },
        })
      : null,
    allow.contracts ? prisma.employmentContract.findMany({ where: { employeeId: id }, orderBy: { startDate: "desc" } }) : null,
    allow.documents ? prisma.employeeDocument.findMany({ where: { employeeId: id, deletedAt: null }, orderBy: { createdAt: "desc" } }) : null,
    allow.history
      ? prisma.auditLog.findMany({ where: { entityType: "Employee", entityId: id }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { email: true } } } })
      : null,
  ]);
  const bank = salary?.salaryProfile ? decrypt(salary.salaryProfile.bankAccountEnc) : null;
  return {
    allow,
    work,
    private: priv,
    salary: salary
      ? {
          profile: salary.salaryProfile
            ? {
                payType: salary.salaryProfile.payType,
                baseSalary: salary.salaryProfile.baseSalary,
                insuranceSalary: salary.salaryProfile.insuranceSalary,
                dependents: salary.salaryProfile.dependents,
                bankName: salary.salaryProfile.bankName,
                bankAccount: bank,
                bankAccountMasked: mask(bank),
                bankAccountName: salary.salaryProfile.bankAccountName,
              }
            : null,
          allowances: salary.allowances,
          adjustments: salary.salaryAdjustments.map((a) => ({ ...a, effectiveDate: keyOf(a.effectiveDate) })),
        }
      : null,
    contracts: contracts?.map((c) => ({ ...c, startDate: keyOf(c.startDate), endDate: keyOf(c.endDate), signedDate: keyOf(c.signedDate) })) ?? null,
    documents,
    history,
  };
}

// ------------------------- Ghi dữ liệu -------------------------
async function assertRefs(tx: Tx, d: { departmentId?: string | null; positionId?: string | null; managerId?: string | null; branchId?: string | null }, selfId?: string) {
  if (d.departmentId && !(await tx.department.findUnique({ where: { id: d.departmentId }, select: { id: true } }))) throw new HttpError(400, "Phòng ban không tồn tại");
  if (d.positionId && !(await tx.position.findUnique({ where: { id: d.positionId }, select: { id: true } }))) throw new HttpError(400, "Chức vụ không tồn tại");
  if (d.branchId && !(await tx.branch.findUnique({ where: { id: d.branchId }, select: { id: true } }))) throw new HttpError(400, "Chi nhánh không tồn tại");
  if (d.managerId) {
    if (d.managerId === selfId) throw new HttpError(400, "Nhân viên không thể là quản lý của chính mình");
    // Chống vòng lặp quản lý (A quản lý B, B quản lý A)
    let cur: string | null = d.managerId;
    for (let i = 0; cur && i < 50; i++) {
      if (cur === selfId) throw new HttpError(400, "Quan hệ quản lý tạo thành vòng lặp");
      const m: { managerId: string | null } | null = await tx.employee.findUnique({ where: { id: cur }, select: { managerId: true } });
      if (!m) throw new HttpError(400, "Người quản lý không tồn tại");
      cur = m.managerId;
    }
  }
}

export async function createEmployee(ctx: AuthCtx, input: CreateEmployeeInput, req?: Request) {
  // Phạm vi: người tạo phải có quyền với phòng ban/chi nhánh của nhân viên mới
  const probe = { id: "__new__", departmentId: input.departmentId ?? null, branchId: input.branchId ?? null, managerId: input.managerId ?? null };
  if (!canAccessEmployee(ctx, "employee.create", probe)) throw new HttpError(403, "Bạn không có quyền thêm nhân viên vào đơn vị này");
  const canPrivate = !!ctx.perms["employee_private.update"] && canAccessEmployee(ctx, "employee_private.update", probe);
  const nidHash = blindIndex(input.nationalId ?? null);
  if (nidHash && (await prisma.employee.findUnique({ where: { nationalIdHash: nidHash }, select: { code: true, fullName: true } }))) {
    throw new HttpError(409, "Số CCCD đã tồn tại trong hệ thống (trùng hồ sơ)", "DUPLICATE_NATIONAL_ID");
  }
  if (input.email && (await prisma.employee.findUnique({ where: { email: input.email }, select: { id: true } }))) {
    throw new HttpError(409, "Email đã được dùng cho nhân viên khác", "DUPLICATE_EMAIL");
  }
  if (!input.confirmDuplicate && input.dateOfBirth) {
    const same = await prisma.employee.findFirst({ where: { fullName: { equals: input.fullName, mode: "insensitive" }, dateOfBirth: dbDate(input.dateOfBirth) }, select: { code: true } });
    if (same) throw new HttpError(409, `Đã có nhân viên cùng họ tên và ngày sinh (mã ${same.code}). Xác nhận nếu đây là người khác.`, "POSSIBLE_DUPLICATE");
  }
  const created = await prisma.$transaction(async (tx) => {
    await assertRefs(tx, input);
    const code = await nextEmployeeCode(tx);
    const e = await tx.employee.create({
      data: {
        code,
        fullName: input.fullName,
        email: input.email ?? null,
        phone: input.phone ?? null,
        departmentId: input.departmentId ?? null,
        positionId: input.positionId ?? null,
        managerId: input.managerId ?? null,
        branchId: input.branchId ?? null,
        startDate: dbDate(input.startDate),
        employmentType: input.employmentType,
        status: input.status,
        probationEndDate: input.probationEndDate ? dbDate(input.probationEndDate) : null,
        searchText: buildSearchText({ fullName: input.fullName, code, email: input.email, phone: input.phone }),
        ...(canPrivate
          ? {
              dateOfBirth: input.dateOfBirth ? dbDate(input.dateOfBirth) : null,
              gender: input.gender ?? "UNDISCLOSED",
              address: input.address ?? null,
              nationalIdEnc: encrypt(input.nationalId ?? null),
              nationalIdHash: nidHash,
              emergencyName: input.emergencyName ?? null,
              emergencyPhone: input.emergencyPhone ?? null,
              emergencyRelation: input.emergencyRelation ?? null,
            }
          : {}),
      },
    });
    if (input.baseSalary && ctx.perms["salary.update"]) {
      await tx.salaryProfile.create({ data: { employeeId: e.id, baseSalary: input.baseSalary } });
    }
    await audit(ctx, { action: "CREATE", entityType: "Employee", entityId: e.id, summary: `Tạo hồ sơ ${code} – ${e.fullName}` }, req, tx);
    return e;
  });
  const hr = await usersWithPerm("employee.update");
  await notifyUsers(hr.filter((u) => u !== ctx.userId), { type: "NEW_EMPLOYEE", title: "Nhân viên mới", body: `${created.code} – ${created.fullName} được thêm vào hệ thống`, link: `/employees/${created.id}` });
  return created;
}

export async function updateEmployee(ctx: AuthCtx, id: string, body: unknown, req?: Request) {
  const ref = await getEmployeeForCtx(ctx, id);
  const canWork = canAccessEmployee(ctx, "employee.update", ref);
  const canPrivate = canAccessEmployee(ctx, "employee_private.update", ref) && (ctx.perms["employee_private.update"] !== "SELF" || ctx.employee?.id === id);
  if (!canWork && !canPrivate) throw new HttpError(403, "Bạn không có quyền sửa hồ sơ này");
  const before = await prisma.employee.findUniqueOrThrow({ where: { id } });
  const raw = (body ?? {}) as Record<string, unknown>;
  const data: Prisma.EmployeeUncheckedUpdateInput = {};
  const changesAfter: Record<string, unknown> = {};

  const hasWork = Object.keys(workInfoSchema.shape).some((k) => k in raw);
  if (hasWork) {
    if (!canWork) throw new HttpError(403, "Bạn không có quyền sửa thông tin công việc");
    const w = workInfoSchema.partial().parse(raw);
    if (w.managerId !== undefined || w.departmentId !== undefined || w.branchId !== undefined) {
      const target = { id, departmentId: w.departmentId ?? before.departmentId, branchId: w.branchId ?? before.branchId, managerId: w.managerId ?? before.managerId };
      if (!canAccessEmployee(ctx, "employee.update", target)) throw new HttpError(403, "Không thể chuyển nhân viên ra ngoài phạm vi quản lý của bạn");
      await assertRefs(prisma, w, id);
    }
    if (w.email && w.email !== before.email && (await prisma.employee.findUnique({ where: { email: w.email }, select: { id: true } }))) {
      throw new HttpError(409, "Email đã được dùng cho nhân viên khác");
    }
    for (const [k, v] of Object.entries(w)) {
      if (v === undefined) continue;
      const isDate = ["startDate", "probationEndDate", "endDate"].includes(k);
      (data as Record<string, unknown>)[k] = isDate ? (v ? dbDate(v as string) : null) : v;
      changesAfter[k] = v;
    }
  }
  const hasPrivate = Object.keys(privateInfoSchema.shape).some((k) => k in raw);
  if (hasPrivate) {
    if (!canPrivate) throw new HttpError(403, "Bạn không có quyền sửa thông tin cá nhân");
    const p = privateInfoSchema.partial().parse(raw);
    if (p.dateOfBirth !== undefined) data.dateOfBirth = p.dateOfBirth ? dbDate(p.dateOfBirth) : null;
    if (p.gender !== undefined) data.gender = p.gender;
    for (const k of ["address", "emergencyName", "emergencyPhone", "emergencyRelation"] as const) if (p[k] !== undefined) data[k] = p[k];
    if (p.nationalId !== undefined) {
      const h = blindIndex(p.nationalId);
      if (h && h !== before.nationalIdHash && (await prisma.employee.findUnique({ where: { nationalIdHash: h }, select: { id: true } }))) {
        throw new HttpError(409, "Số CCCD đã tồn tại trong hệ thống");
      }
      data.nationalIdEnc = encrypt(p.nationalId);
      data.nationalIdHash = h;
    }
    Object.assign(changesAfter, p);
  }
  if (!Object.keys(data).length) throw new HttpError(400, "Không có thay đổi");
  const merged = { ...before, ...data } as typeof before;
  data.searchText = buildSearchText(merged);

  const beforeView: Record<string, unknown> = {
    ...before,
    startDate: keyOf(before.startDate),
    probationEndDate: keyOf(before.probationEndDate),
    endDate: keyOf(before.endDate),
    dateOfBirth: keyOf(before.dateOfBirth),
    nationalId: "[ẩn]",
  };
  const changes = diff(beforeView, changesAfter);
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.employee.update({ where: { id }, data });
    if (Object.keys(changes).length) {
      await audit(ctx, { action: "UPDATE", entityType: "Employee", entityId: id, summary: `Cập nhật hồ sơ ${before.code}`, changes }, req, tx);
    }
    return u;
  });
  return updated;
}

export async function setEmployeeActive(ctx: AuthCtx, id: string, active: boolean, reason: string, req?: Request) {
  const ref = await getEmployeeForCtx(ctx, id, "employee.delete");
  if (ctx.employee?.id === id) throw new HttpError(400, "Không thể tự ngừng kích hoạt hồ sơ của mình");
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id }, data: { deactivatedAt: active ? null : new Date() } });
    if (!active) {
      // Khoá tài khoản và thu hồi phiên đăng nhập – dữ liệu hồ sơ được giữ nguyên, không xoá
      const user = await tx.user.findUnique({ where: { employeeId: id } });
      if (user) {
        await tx.user.update({ where: { id: user.id }, data: { isActive: false } });
        await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
    }
    await audit(ctx, { action: active ? "REACTIVATE" : "DEACTIVATE", entityType: "Employee", entityId: id, summary: `${active ? "Kích hoạt lại" : "Ngừng kích hoạt"} hồ sơ ${ref.fullName}: ${reason}` }, req, tx);
  });
}
