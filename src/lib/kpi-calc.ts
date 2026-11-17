// Tính tỷ lệ hoàn thành KPI (thuần) – kiểm thử trong tests/kpi.test.ts
export const KPI_CAP = 1.5;

export function kpiCompletion(direction: "HIGHER_BETTER" | "LOWER_BETTER", target: number, actual: number | null | undefined): number | null {
  if (actual === null || actual === undefined) return null;
  if (direction === "HIGHER_BETTER") {
    if (target <= 0) return actual > 0 ? KPI_CAP : 1;
    return Math.min(KPI_CAP, Math.max(0, actual / target));
  }
  // Càng thấp càng tốt (ví dụ số lỗi): đạt chỉ tiêu khi actual <= target
  if (actual <= 0) return KPI_CAP;
  return Math.min(KPI_CAP, Math.max(0, target / actual));
}

/** Điểm tổng hợp có trọng số; bỏ qua KPI chưa có kết quả */
export function weightedScore(items: { weight: number; completion: number | null }[]): number | null {
  const valid = items.filter((i) => i.completion !== null && i.weight > 0);
  const w = valid.reduce((s, i) => s + i.weight, 0);
  if (!w) return null;
  return valid.reduce((s, i) => s + i.weight * (i.completion as number), 0) / w;
}

export function kpiRating(score: number | null): { label: string; tone: "green" | "blue" | "amber" | "red" | "slate" } {
  if (score === null) return { label: "Chưa có kết quả", tone: "slate" };
  if (score >= 1.1) return { label: "Xuất sắc", tone: "green" };
  if (score >= 0.95) return { label: "Hoàn thành tốt", tone: "blue" };
  if (score >= 0.75) return { label: "Hoàn thành", tone: "amber" };
  return { label: "Chưa đạt", tone: "red" };
}
