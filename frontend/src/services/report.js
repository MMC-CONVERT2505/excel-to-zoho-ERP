// Report browser me hi banta hai — user ki Excel server par save nahi hoti, download seedha PC par.
// User ki apni sheet + ye 3 columns. Dobara upload karne par backend ye columns ignore karta hai
// (backend/src/import/excel.js ke REPORT_HEADERS ke saath sync rakho).
const REPORT_HEADERS = ['Import Status', 'Import Details', 'Zoho Transaction ID'];
export const PROBLEM_STATUSES = new Set(['invalid', 'failed', 'cancelled']);

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const details = (r) => [r.message, r.zoho_code !== undefined && `Zoho code ${r.zoho_code}`].filter(Boolean).join(' · ');
const loadXlsx = () => import('xlsx'); // sirf download ke waqt load (page halka rahe)

// file: user ki original Excel (File). onlyProblems: sirf invalid/failed/cancelled — sudhaar kar dobara upload ke liye.
// Original cells (value + date format) jaise ke taise copy, taaki dobara upload par dates na badlein.
export async function buildReport(file, results, { onlyProblems = false } = {}) {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellNF: true }); // cellNF: date ka format bhi copy ho
  const name = wb.SheetNames[0];
  const src = wb.Sheets[name];
  const range = XLSX.utils.decode_range(src['!ref'] || 'A1');
  const cellAt = (r, c) => src[XLSX.utils.encode_cell({ r, c })];

  // Purani report dobara aayi ho to uske status columns ki jagah naye likho
  let width = range.e.c + 1;
  for (let c = range.s.c; c <= range.e.c; c++) {
    if (norm(cellAt(range.s.r, c)?.v) === norm(REPORT_HEADERS[0])) { width = c; break; }
  }

  const ws = {};
  let outRow = 0;
  const writeRow = (r, extra) => {
    for (let c = 0; c < width; c++) {
      const cell = cellAt(r, c);
      if (cell) ws[XLSX.utils.encode_cell({ r: outRow, c })] = { ...cell };
    }
    extra.forEach((v, i) => { ws[XLSX.utils.encode_cell({ r: outRow, c: width + i })] = { t: 's', v: String(v ?? '') }; });
    outRow++;
  };

  writeRow(range.s.r, REPORT_HEADERS);
  const byRow = new Map(results.map((r) => [r.row, r]));
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const res = byRow.get(r - range.s.r + 1); // rowNumber: header = 1
    if (!res) continue; // khali row
    if (onlyProblems && !PROBLEM_STATUSES.has(res.status)) continue;
    writeRow(r, [res.status, details(res), res.transaction_id || '']);
  }

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(outRow - 1, 0), c: width + REPORT_HEADERS.length - 1 } });
  ws['!cols'] = [...Array(width).fill({ wch: 16 }), { wch: 12 }, { wch: 70 }, { wch: 22 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, name || 'Sheet1');
  return toFile(XLSX, book, `${baseName(file.name)}-${onlyProblems ? 'failed-rows' : 'report'}.xlsx`);
}

// Original file na ho (dusre browser / data saaf) to sirf result se simple sheet — dekhne ke liye, dobara upload ke liye nahi
export async function buildResultSheet(results, name, { onlyProblems = false } = {}) {
  const XLSX = await loadXlsx();
  const rows = results
    .filter((r) => !onlyProblems || PROBLEM_STATUSES.has(r.status))
    .map((r) => ({ Row: r.row, 'Reference#': r.reference || '', Date: r.date || '', Amount: r.amount || '', 'Import Status': r.status, 'Import Details': details(r), 'Zoho Transaction ID': r.transaction_id || '' }));
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 70 }, { wch: 22 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, ws, 'Result');
  return toFile(XLSX, book, `${baseName(name)}-${onlyProblems ? 'failed-rows' : 'report'}.xlsx`);
}

const baseName = (name) => String(name || 'import').replace(/\.[^.]+$/, '').replace(/-(failed-rows|report)$/, '');

function toFile(XLSX, book, name) {
  const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  return new File([bytes], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// File ko PC me download karo
export function saveToPc(file) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
