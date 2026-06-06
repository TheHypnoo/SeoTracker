type CsvCell = string | number;

function escapeCell(cell: CsvCell): string {
  const text = String(cell);
  // Quote when the value contains a delimiter, quote or newline; double embedded quotes.
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Builds a CSV from headers + rows and triggers a client-side download. Prepends a UTF-8 BOM so
 * Excel opens accented Spanish text correctly. Runs only from click handlers (browser context).
 */
export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
