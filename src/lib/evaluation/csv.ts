/** Small RFC 4180 reader: quoted commas/newlines and doubled quotes are preserved. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/u, "").replace(/^# SYNTHETIC[^\n]*\r?\n/u, "");
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += c;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; closed = false; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); if (row.some((value) => value !== "")) rows.push(row);
      row = []; cell = ""; closed = false;
    } else { if (closed || c === '"') throw new Error("CSV_INVALID"); cell += c; }
  }
  if (quoted) throw new Error("CSV_INVALID");
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
export function writeCsv(rows: readonly (readonly (string | number)[])[]): string {
  return rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
}
