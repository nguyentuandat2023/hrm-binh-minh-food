// In ma trận phân quyền mặc định dạng Markdown (dùng cho tài liệu): npx tsx scripts/print-permission-matrix.ts
import { ACTION_LABEL, DEFAULT_ROLE_MATRIX, MODULES, SYSTEM_ROLES, type Action } from "../src/lib/permissions";

const S: Record<string, string> = { SELF: "Bản thân", TEAM: "Nhóm", DEPARTMENT: "Phòng", BRANCH: "Chi nhánh", COMPANY: "Công ty" };
const roles = SYSTEM_ROLES.map((r) => r.key);
const lines = [`| Module | Hành động | ${SYSTEM_ROLES.map((r) => r.name).join(" | ")} |`, `|---|---|${roles.map(() => "---").join("|")}|`];
for (const m of MODULES) {
  for (const a of Object.keys(m.actions) as Action[]) {
    const key = `${m.key}.${a}`;
    lines.push(`| ${m.name} | ${ACTION_LABEL[a]} | ${roles.map((r) => S[DEFAULT_ROLE_MATRIX[r][key]] ?? "—").join(" | ")} |`);
  }
}
console.log(lines.join("\n"));
