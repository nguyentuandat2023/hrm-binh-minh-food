import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageAuth } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { fmtDate, fmtVND } from "@/lib/format";
import { ASSET_CATEGORY } from "@/lib/labels";
import { audit } from "@/lib/audit";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Biên bản bàn giao tài sản" };

export default async function HandoverPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageAuth();
  const { id } = await params;
  const h = await prisma.assetAssignment.findUnique({ where: { id }, include: { asset: true, employee: { select: { id: true, fullName: true, code: true, department: { select: { name: true } }, position: { select: { name: true } } } } } });
  if (!h) notFound();
  if (ctx.perms["asset.export"] !== "COMPANY" && ctx.employee?.id !== h.employeeId) redirect("/forbidden");
  const [company, giver, receiver] = await Promise.all([
    getSetting("company"),
    h.assignedById ? prisma.user.findUnique({ where: { id: h.assignedById }, select: { email: true, employee: { select: { fullName: true } } } }) : null,
    h.receivedById ? prisma.user.findUnique({ where: { id: h.receivedById }, select: { email: true, employee: { select: { fullName: true } } } }) : null,
  ]);
  await audit(ctx, { action: "EXPORT", entityType: "AssetAssignment", entityId: h.id, summary: `In biên bản bàn giao ${h.asset.code}` });
  const returned = !!h.returnedAt;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex justify-end">
        <PrintButton label="In / Lưu PDF biên bản" />
      </div>
      <div className="print-area space-y-4 rounded-xl border border-border bg-white p-8 text-sm text-black">
        <div className="flex justify-between">
          <p className="font-semibold">{company.name}</p>
          <div className="text-center text-xs">
            <p className="font-semibold">CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
            <p>Độc lập – Tự do – Hạnh phúc</p>
          </div>
        </div>
        <h1 className="text-center text-lg font-bold uppercase">Biên bản {returned ? "thu hồi" : "bàn giao"} tài sản</h1>
        <p>Hôm nay, ngày {fmtDate(returned ? h.returnedAt : h.assignedAt)}, tại {company.name}, chúng tôi gồm:</p>
        <p>
          <b>Bên giao:</b> {returned ? h.employee.fullName : (giver?.employee?.fullName ?? giver?.email ?? "Đại diện công ty")}
          <br />
          <b>Bên nhận:</b> {returned ? (receiver?.employee?.fullName ?? receiver?.email ?? "Đại diện công ty") : `${h.employee.fullName} (${h.employee.code}) – ${h.employee.position?.name ?? ""}, ${h.employee.department?.name ?? ""}`}
        </p>
        <p>Cùng thống nhất {returned ? "thu hồi" : "bàn giao"} tài sản sau:</p>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Mã", "Tên tài sản", "Loại", "Số serial", "Giá trị", "Tình trạng"].map((x) => (
                <th key={x} className="border border-black px-2 py-1 text-left">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-black px-2 py-1">{h.asset.code}</td>
              <td className="border border-black px-2 py-1">{h.asset.name}</td>
              <td className="border border-black px-2 py-1">{ASSET_CATEGORY[h.asset.category]}</td>
              <td className="border border-black px-2 py-1">{h.asset.serialNumber}</td>
              <td className="border border-black px-2 py-1">{h.asset.purchaseCost ? fmtVND(h.asset.purchaseCost) : ""}</td>
              <td className="border border-black px-2 py-1">{returned ? h.conditionIn : h.conditionOut}</td>
            </tr>
          </tbody>
        </table>
        {h.note && <p>Ghi chú: {h.note}</p>}
        <p>Bên nhận có trách nhiệm bảo quản, sử dụng tài sản đúng mục đích và hoàn trả khi có yêu cầu hoặc khi nghỉ việc.</p>
        <div className="grid grid-cols-2 pt-6 text-center">
          <div>
            <p className="font-semibold">BÊN GIAO</p>
            <p className="text-xs">(Ký, ghi rõ họ tên)</p>
          </div>
          <div>
            <p className="font-semibold">BÊN NHẬN</p>
            <p className="text-xs">(Ký, ghi rõ họ tên)</p>
          </div>
        </div>
        <div className="h-20" />
      </div>
    </div>
  );
}
