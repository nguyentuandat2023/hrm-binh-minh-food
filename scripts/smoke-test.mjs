// Kiểm thử end-to-end qua HTTP với server đang chạy (mặc định http://localhost:3000) và dữ liệu demo.
// Chạy: npm run test:smoke   (cần đã chạy seed demo và `npm run dev` hoặc `npm start`)
import { results } from "./smoke-lib.mjs";
import { runAll } from "./smoke-cases.mjs";

await runAll();
const failed = results.filter((r) => !r.ok);
console.log(`\nKết quả: ${results.length - failed.length}/${results.length} đạt`);
if (failed.length) {
  console.log("Các case lỗi:");
  for (const f of failed) console.log(" -", f.name, "→", f.err);
}
process.exit(failed.length ? 1 : 0);