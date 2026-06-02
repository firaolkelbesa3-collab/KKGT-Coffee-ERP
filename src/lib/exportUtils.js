/**
 * Backwards-compatible export helpers.
 *
 * These keep the original signatures every report already calls, but now
 * delegate to the unified branded report engine (jspdf-autotable + exceljs).
 * So every existing report instantly gets the beautiful, consistent KKGT Import Export
 * styling with zero call-site changes.
 */
import { exportReportPDF, exportReportXLSX } from '@/lib/reportEngine';

function slug(s) {
  return String(s || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

// exportXLSX(filename, reportTitle, headers, rows, totalsRow, dateRange)
// If a totalsRow is passed, the report wants totals → we auto-sum EVERY numeric
// column (with live =SUM formulas), not just whatever the caller filled in.
export function exportXLSX(filename, reportTitle, headers, rows, totalsRow, dateRange) {
  // Fire-and-forget (engine is async); the download still triggers normally.
  exportReportXLSX({
    title: reportTitle,
    subtitle: dateRange,
    headers,
    rows,
    autoTotals: !!totalsRow,
    filename: slug(filename || reportTitle),
  });
}

// exportPDF(title, headers, rows, totalsRow)
export function exportPDF(title, headers, rows, totalsRow) {
  exportReportPDF({
    title,
    headers,
    rows,
    autoTotals: !!totalsRow,
    filename: slug(title),
  });
}
