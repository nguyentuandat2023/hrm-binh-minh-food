import { vnDateKey } from "../dates";
import { spGet, type SP } from "../utils";

export function reportFilters(sp: SP, fallbackBranch?: string | null) {
  const today = vnDateKey().slice(0, 7);
  const ok = (s?: string) => (s && /^\d{4}-\d{2}$/.test(s) ? s : undefined);
  let from = ok(spGet(sp, "from")) ?? today;
  let to = ok(spGet(sp, "to")) ?? from;
  if (to < from) [from, to] = [to, from];
  return { from, to, departmentId: spGet(sp, "department"), branchId: spGet(sp, "branch") || fallbackBranch || undefined, compare: spGet(sp, "compare") === "1" };
}
