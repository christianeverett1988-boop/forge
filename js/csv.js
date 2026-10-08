// CSV helpers (pure, so they can be unit tested).

/** One CSV cell: quoted when needed, and neutralised if a spreadsheet would run it as a formula. */
export function csvCell(v) {
  let s = String(v ?? '');
  // CSV injection: cells starting with = + - @ (or tab/CR) can run as formulas in Excel/Sheets/Numbers.
  // Prefix them with ' — except plain negative numbers, which stay numbers.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows, columns) {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n');
}
