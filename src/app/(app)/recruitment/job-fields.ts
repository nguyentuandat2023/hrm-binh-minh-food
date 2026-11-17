import type { FieldDef } from "@/components/form-dialog";
import type { OrgOptions } from "@/lib/options";
import { JOB_STATUS, toOptions } from "@/lib/labels";

export function jobFields(
  opts: OrgOptions,
  j?: { id: string; title: string; departmentId: string | null; positionId: string | null; branchId: string | null; headcount: number; salaryRange: string | null; deadline: Date | null; description: string | null; requirements: string | null; status: string },
): FieldDef[] {
  return [
    ...(j ? [{ name: "id", label: "", type: "hidden" as const, defaultValue: j.id }] : []),
    { name: "title", label: "Tên vị trí", required: true, full: true, defaultValue: j?.title },
    { name: "departmentId", label: "Phòng ban", type: "select", options: opts.departments, defaultValue: j?.departmentId },
    { name: "positionId", label: "Chức vụ", type: "select", options: opts.positions, defaultValue: j?.positionId },
    { name: "branchId", label: "Chi nhánh", type: "select", options: opts.branches, defaultValue: j?.branchId },
    { name: "headcount", label: "Số lượng cần tuyển", type: "number", min: 1, required: true, defaultValue: j?.headcount ?? 1 },
    { name: "salaryRange", label: "Mức lương dự kiến", defaultValue: j?.salaryRange },
    { name: "deadline", label: "Hạn nhận hồ sơ", type: "date", defaultValue: j?.deadline?.toISOString().slice(0, 10) },
    { name: "status", label: "Trạng thái", type: "select", required: true, options: toOptions(JOB_STATUS), defaultValue: j?.status ?? "OPEN" },
    { name: "description", label: "Mô tả công việc", type: "textarea", defaultValue: j?.description },
    { name: "requirements", label: "Yêu cầu", type: "textarea", defaultValue: j?.requirements },
  ];
}
