import type { BadgeTone } from "@/components/ui/badge";

export const EMPLOYEE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PROBATION: { label: "Thử việc", tone: "amber" },
  ACTIVE: { label: "Đang làm việc", tone: "green" },
  LEAVE_OF_ABSENCE: { label: "Tạm nghỉ", tone: "blue" },
  RESIGNED: { label: "Đã nghỉ việc", tone: "slate" },
};
export const GENDER: Record<string, string> = { MALE: "Nam", FEMALE: "Nữ", OTHER: "Khác", UNDISCLOSED: "Không khai báo" };
export const EMPLOYMENT_TYPE: Record<string, string> = {
  FULL_TIME: "Toàn thời gian",
  PART_TIME: "Bán thời gian",
  INTERN: "Thực tập",
  SEASONAL: "Thời vụ",
  CONTRACTOR: "Cộng tác viên",
};
export const CONTRACT_TYPE: Record<string, string> = {
  PROBATION: "Thử việc",
  FIXED_TERM: "Xác định thời hạn",
  INDEFINITE: "Không xác định thời hạn",
  SERVICE: "Dịch vụ / CTV",
};
export const CONTRACT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Nháp", tone: "slate" },
  ACTIVE: { label: "Hiệu lực", tone: "green" },
  EXPIRED: { label: "Hết hạn", tone: "red" },
  TERMINATED: { label: "Đã chấm dứt", tone: "slate" },
  RENEWED: { label: "Đã gia hạn", tone: "blue" },
};
export const PAY_TYPE: Record<string, string> = { MONTHLY: "Theo tháng", DAILY: "Theo ngày công", HOURLY: "Theo giờ" };
export const REQUEST_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Chờ duyệt", tone: "amber" },
  APPROVED: { label: "Đã duyệt", tone: "green" },
  REJECTED: { label: "Từ chối", tone: "red" },
  CANCELLED: { label: "Đã huỷ", tone: "slate" },
};
export const HALF_DAY: Record<string, string> = { NONE: "Cả ngày", MORNING: "Buổi sáng", AFTERNOON: "Buổi chiều" };
export const DOC_CATEGORY: Record<string, string> = {
  AVATAR: "Ảnh đại diện",
  CV: "CV / Hồ sơ xin việc",
  ID_CARD: "CCCD / Giấy tờ tuỳ thân",
  CONTRACT: "Hợp đồng",
  CERTIFICATE: "Bằng cấp / Chứng chỉ",
  LEAVE_ATTACHMENT: "Giấy tờ nghỉ phép",
  OTHER: "Khác",
};
export const CHECK_METHOD: Record<string, string> = { WEB: "Web", QR: "Mã QR", GPS: "GPS", MANUAL: "Nhập tay", ADJUSTMENT: "Điều chỉnh" };
export const PAYROLL_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Nháp", tone: "slate" },
  CALCULATED: { label: "Đã tính – chờ kiểm tra", tone: "amber" },
  APPROVED: { label: "Đã duyệt", tone: "blue" },
  LOCKED: { label: "Đã khoá", tone: "green" },
};
export const KPI_CATEGORY: Record<string, string> = { SALES: "Doanh số", TASK: "Công việc", QUALITY: "Chất lượng", PROGRESS: "Tiến độ", PERSONAL: "Mục tiêu cá nhân" };
export const KPI_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  OPEN: { label: "Đang thực hiện", tone: "blue" },
  SUBMITTED: { label: "Đã nộp", tone: "amber" },
  REVIEWED: { label: "Đã đánh giá", tone: "green" },
  CLOSED: { label: "Đã chốt", tone: "slate" },
};
export const JOB_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Nháp", tone: "slate" },
  OPEN: { label: "Đang tuyển", tone: "green" },
  ON_HOLD: { label: "Tạm dừng", tone: "amber" },
  CLOSED: { label: "Đã đóng", tone: "slate" },
};
export const CANDIDATE_STAGE: Record<string, { label: string; tone: BadgeTone }> = {
  APPLIED: { label: "Nhận hồ sơ", tone: "slate" },
  SCREENING: { label: "Sàng lọc", tone: "blue" },
  INTERVIEW: { label: "Phỏng vấn", tone: "violet" },
  ASSESSMENT: { label: "Đánh giá", tone: "amber" },
  OFFER: { label: "Đề nghị tuyển dụng", tone: "primary" },
  HIRED: { label: "Đã tiếp nhận", tone: "green" },
  REJECTED: { label: "Không đạt", tone: "red" },
  WITHDRAWN: { label: "Rút hồ sơ", tone: "slate" },
};
export const ASSET_CATEGORY: Record<string, string> = { LAPTOP: "Laptop", PHONE: "Điện thoại", OFFICE_EQUIPMENT: "Thiết bị văn phòng", TOOL: "Công cụ dụng cụ", OTHER: "Khác" };
export const ASSET_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  AVAILABLE: { label: "Sẵn sàng", tone: "green" },
  ASSIGNED: { label: "Đang sử dụng", tone: "blue" },
  MAINTENANCE: { label: "Bảo trì", tone: "amber" },
  LOST: { label: "Thất lạc", tone: "red" },
  RETIRED: { label: "Thanh lý", tone: "slate" },
};
export const TASK_CATEGORY: Record<string, string> = {
  DOCUMENT: "Giấy tờ",
  ACCOUNT: "Tài khoản",
  EQUIPMENT: "Thiết bị",
  TRAINING: "Đào tạo",
  REVIEW: "Đánh giá",
  HANDOVER: "Bàn giao",
  ASSET_RETURN: "Thu hồi tài sản",
  ACCESS_REVOKE: "Thu hồi quyền truy cập",
  FINAL_SETTLEMENT: "Quyết toán",
  OTHER: "Khác",
};

export const toOptions = (m: Record<string, string | { label: string }>) =>
  Object.entries(m).map(([value, v]) => ({ value, label: typeof v === "string" ? v : v.label }));
