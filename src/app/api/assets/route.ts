import { z } from "zod";
import { prisma } from "@/lib/db";
import { api, fileResponse, parseBody, searchParams } from "@/lib/api";
import { requirePerm } from "@/lib/rbac";
import { dbDate, isDateKey, vnDateKey } from "@/lib/dates";
import { HttpError } from "@/lib/errors";
import { nextCode } from "@/lib/sequence";
import { audit } from "@/lib/audit";
import { buildWorkbook, XLSX_MIME } from "@/lib/excel";
import { ASSET_CATEGORY, ASSET_STATUS } from "@/lib/labels";
import { fmtDate } from "@/lib/format";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(150),
  category: z.enum(["LAPTOP", "PHONE", "OFFICE_EQUIPMENT", "TOOL", "OTHER"]),
  serialNumber: z.string().trim().max(100).nullable().optional(),
  purchaseDate: z.string().refine(isDateKey).nullable().optional(),
  purchaseCost: z.number().int().min(0).max(10_000_000_000).nullable().optional(),
  branchId: z.string().nullable().optional(),
  condition: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(["AVAILABLE", "MAINTENANCE", "LOST", "RETIRED"]).optional(),
});

/** Thêm / sửa tài sản. Trạng thái "Đang sử dụng" chỉ thay đổi qua bàn giao/thu hồi. */
export const POST = api(async (req, { ctx }) => {
  const { id, purchaseDate, status, ...b } = await parseBody(req, schema);
  const data = { ...b, purchaseDate: purchaseDate ? dbDate(purchaseDate) : null, branchId: b.branchId ?? null };
  if (id) {
    requirePerm(ctx, "asset.update", "COMPANY");
    const a = await prisma.asset.findUnique({ where: { id } });
    if (!a) throw new HttpError(404, "Tài sản không tồn tại");
    if (status && a.status === "ASSIGNED") throw new HttpError(409, "Tài sản đang được sử dụng – thu hồi trước khi đổi trạng thái");
    await prisma.asset.update({ where: { id }, data: { ...data, ...(status ? { status } : {}) } });
    await audit(ctx, { action: "UPDATE", entityType: "Asset", entityId: id, summary: `Cập nhật tài sản ${a.code}${status ? ` → ${status}` : ""}` }, req);
    return { id };
  }
  requirePerm(ctx, "asset.create", "COMPANY");
  const code = await nextCode("asset", "TS-");
  const a = await prisma.asset.create({ data: { ...data, code, status: "AVAILABLE" } });
  await audit(ctx, { action: "CREATE", entityType: "Asset", entityId: a.id, summary: `Thêm tài sản ${code} – ${b.name}` }, req);
  return { id: a.id, code };
});

/** Xuất danh sách tài sản */
export const GET = api(async (req, { ctx }) => {
  requirePerm(ctx, "asset.export", "COMPANY");
  void searchParams(req);
  const items = await prisma.asset.findMany({ include: { currentHolder: { select: { fullName: true, code: true } }, branch: { select: { name: true } } }, orderBy: { code: "asc" } });
  const buf = await buildWorkbook([
    {
      name: "Tài sản",
      title: `DANH SÁCH TÀI SẢN – ${fmtDate(vnDateKey())}`,
      columns: [
        { header: "Mã", key: "code", width: 10 },
        { header: "Tên tài sản", key: "name", width: 30 },
        { header: "Loại", key: "cat", width: 18 },
        { header: "Số serial", key: "serial", width: 16 },
        { header: "Ngày mua", key: "date", width: 12 },
        { header: "Giá trị", key: "cost", width: 14, numFmt: "#,##0" },
        { header: "Tình trạng", key: "status", width: 14 },
        { header: "Người sử dụng", key: "holder", width: 24 },
        { header: "Chi nhánh", key: "branch", width: 18 },
      ],
      rows: items.map((a) => ({ code: a.code, name: a.name, cat: ASSET_CATEGORY[a.category], serial: a.serialNumber ?? "", date: fmtDate(a.purchaseDate), cost: a.purchaseCost, status: ASSET_STATUS[a.status].label, holder: a.currentHolder ? `${a.currentHolder.fullName} (${a.currentHolder.code})` : "", branch: a.branch?.name ?? "" })),
    },
  ]);
  await audit(ctx, { action: "EXPORT", entityType: "Asset", summary: `Xuất danh sách ${items.length} tài sản` }, req);
  return fileResponse(buf, `tai-san-${vnDateKey()}.xlsx`, XLSX_MIME);
});
