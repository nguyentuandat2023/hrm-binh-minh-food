import "server-only";
import ExcelJS from "exceljs";

export interface SheetSpec {
  name: string;
  title?: string;
  columns: { header: string; key: string; width?: number; numFmt?: string }[];
  rows: Record<string, unknown>[];
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function buildWorkbook(sheets: SheetSpec[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HRM";
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    let startRow = 1;
    if (s.title) {
      ws.mergeCells(1, 1, 1, Math.max(1, s.columns.length));
      const c = ws.getCell(1, 1);
      c.value = s.title;
      c.font = { bold: true, size: 14 };
      startRow = 3;
    }
    const header = ws.getRow(startRow);
    s.columns.forEach((col, i) => {
      const cell = header.getCell(i + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
      cell.alignment = { vertical: "middle", wrapText: true };
      ws.getColumn(i + 1).width = col.width ?? 18;
      if (col.numFmt) ws.getColumn(i + 1).numFmt = col.numFmt;
    });
    s.rows.forEach((r, ri) => {
      const row = ws.getRow(startRow + 1 + ri);
      s.columns.forEach((col, ci) => {
        const v = r[col.key];
        row.getCell(ci + 1).value = (v === undefined ? null : v) as ExcelJS.CellValue;
      });
    });
    ws.views = [{ state: "frozen", ySplit: startRow }];
    ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow, column: s.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Đọc sheet đầu tiên thành mảng object theo dòng tiêu đề (dòng 1) */
export async function readFirstSheet(buf: Buffer): Promise<{ headers: string[]; rows: { rowNumber: number; values: Record<string, string> }[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => (headers[col - 1] = String(cell.text ?? "").trim()));
  const rows: { rowNumber: number; values: Record<string, string> }[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const values: Record<string, string> = {};
    let any = false;
    headers.forEach((h, i) => {
      const cell = row.getCell(i + 1);
      let text: string;
      if (cell.value instanceof Date) text = cell.value.toISOString().slice(0, 10);
      else text = String(cell.text ?? "").trim();
      values[h] = text;
      if (text) any = true;
    });
    if (any) rows.push({ rowNumber: n, values });
  });
  return { headers, rows };
}
