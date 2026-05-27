import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';

const fmtVal = v => (v === null || v === undefined || v === '') ? '—' : String(v);
const fmtTs = iso => { try { return format(parseISO(iso), 'd MMM yyyy HH:mm'); } catch { return iso || '—'; } };

export function exportHistoryPDF(history) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const W = 297, M = 10;

  // Header
  doc.setFillColor(18, 100, 51);
  doc.rect(0, 0, W, 22, 'F');
  doc.setFillColor(240, 103, 33);
  doc.rect(0, 22, W, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('KKGT IMPORT & EXPORT — ETHIOPIA', M, 10);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text('Warehouse Receipt Change History — CONFIDENTIAL', M, 17);
  doc.text(`Generated: ${format(new Date(), 'd MMM yyyy HH:mm')}`, W - M, 17, { align: 'right' });

  doc.setTextColor(30, 30, 30);
  let y = 30;
  let pageNum = 1;
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');

  // Column headers
  const HEADS = ['Date/Time', 'User', 'Role', 'Action', 'Coffee Code', 'Supplier', 'GRN', 'Field Changed', 'Old Value', 'New Value'];
  const CW = [32, 28, 20, 16, 32, 34, 18, 32, 24, 24];

  const drawHead = () => {
    doc.setFillColor(245, 245, 245);
    doc.rect(M, y, W - 2 * M, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setTextColor(80, 80, 80);
    let x = M;
    HEADS.forEach((h, i) => { doc.text(h, x + 1, y + 4.2); x += CW[i]; });
    y += 6;
  };
  drawHead();

  // Flatten each history entry into rows (one per field change)
  history.sort((a, b) => (b.action_at || '').localeCompare(a.action_at || '')).forEach(h => {
    let changes = [];
    try { changes = JSON.parse(h.changes || '[]'); } catch {}
    const rows = changes.length > 0 ? changes : [{ label: '—', old_value: null, new_value: null }];
    rows.forEach((c, ci) => {
      if (y > 195) {
        doc.addPage();
        pageNum++;
        doc.setFillColor(18, 100, 51); doc.rect(0, 0, W, 22, 'F');
        doc.setFillColor(240, 103, 33); doc.rect(0, 22, W, 2, 'F');
        doc.setTextColor(255, 255, 255); doc.setFontSize(9);
        doc.text(`Page ${pageNum}`, W - M, 10, { align: 'right' });
        doc.setTextColor(30, 30, 30); y = 28;
        drawHead();
      }
      const even = ci % 2 === 0;
      if (even) { doc.setFillColor(252, 252, 252); doc.rect(M, y, W - 2 * M, 5.5, 'F'); }
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30); doc.setFontSize(7);
      const cells = [
        ci === 0 ? fmtTs(h.action_at) : '',
        ci === 0 ? (h.user_name || h.user_email || '—') : '',
        ci === 0 ? (h.user_role || '—') : '',
        ci === 0 ? (h.action_type || '—') : '',
        ci === 0 ? (h.coffee_code || '—') : '',
        ci === 0 ? (h.supplier_name || '—').slice(0, 18) : '',
        ci === 0 ? (h.grn_code || '—') : '',
        c.label || c.field || '—',
        fmtVal(c.old_value),
        fmtVal(c.new_value),
      ];
      let x = M;
      cells.forEach((cell, i) => { doc.text(String(cell).slice(0, 20), x + 1, y + 3.8); x += CW[i]; });
      y += 5.5;
    });
  });

  doc.save(`KKGT-Warehouse-History-${format(new Date(), 'd-MMM-yyyy')}.pdf`);
}

export function exportHistoryExcel(history) {
  const headers = ['Date', 'Time', 'User', 'Role', 'Action', 'Coffee Code', 'Supplier', 'GRN Code', 'Field Changed', 'Old Value', 'New Value'];
  const rows = [];

  history.sort((a, b) => (b.action_at || '').localeCompare(a.action_at || '')).forEach(h => {
    let changes = [];
    try { changes = JSON.parse(h.changes || '[]'); } catch {}
    if (changes.length === 0) changes = [{ label: '—', old_value: '', new_value: '' }];
    changes.forEach(c => {
      let dateStr = '', timeStr = '';
      try { dateStr = format(parseISO(h.action_at), 'd MMM yyyy'); timeStr = format(parseISO(h.action_at), 'HH:mm'); } catch {}
      rows.push([
        dateStr, timeStr,
        h.user_name || h.user_email || '',
        h.user_role || '',
        h.action_type || '',
        h.coffee_code || '',
        h.supplier_name || '',
        h.grn_code || '',
        c.label || c.field || '',
        fmtVal(c.old_value),
        fmtVal(c.new_value),
      ]);
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'History');
  XLSX.writeFile(wb, `KKGT-Warehouse-History-${format(new Date(), 'd-MMM-yyyy')}.xlsx`);
}