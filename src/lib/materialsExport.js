import { exportReportPDF, exportReportXLSX } from '@/lib/reportEngine';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function slug(s) {
  return String(s || 'materials').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function exportMaterialsPDF({ title, summary, headers, rows }) {
  exportReportPDF({
    title,
    subtitle: summary && summary.length ? summary.join('  ·  ') : undefined,
    headers,
    rows,
    filename: slug(title),
  });
}

export function exportMaterialsExcel({ title, sheetName, headers, rows }) {
  exportReportXLSX({
    title: title || sheetName,
    headers,
    rows,
    filename: slug(title || sheetName),
  });
}

export { fmt };
