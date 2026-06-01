import { format, parseISO } from 'date-fns';
import { exportReportPDF, exportReportXLSX } from '@/lib/reportEngine';

const fmtVal = v => (v === null || v === undefined || v === '') ? '—' : String(v);

// Flatten history entries (one row per changed field) into headers + rows.
function buildRows(history) {
  const rows = [];
  [...history]
    .sort((a, b) => (b.action_at || '').localeCompare(a.action_at || ''))
    .forEach(h => {
      let changes = [];
      try { changes = JSON.parse(h.changes || '[]'); } catch { /* ignore */ }
      if (changes.length === 0) changes = [{ label: '—', old_value: '', new_value: '' }];
      changes.forEach((c, ci) => {
        let dt = '';
        try { dt = format(parseISO(h.action_at), 'd MMM yyyy HH:mm'); } catch { dt = h.action_at || ''; }
        rows.push([
          ci === 0 ? dt : '',
          ci === 0 ? (h.user_name || h.user_email || '') : '',
          ci === 0 ? (h.user_role || '') : '',
          ci === 0 ? (h.action_type || '') : '',
          ci === 0 ? (h.coffee_code || '') : '',
          ci === 0 ? (h.supplier_name || '') : '',
          ci === 0 ? (h.grn_code || '') : '',
          c.label || c.field || '—',
          fmtVal(c.old_value),
          fmtVal(c.new_value),
        ]);
      });
    });
  return rows;
}

const HEADERS = ['Date/Time', 'User', 'Role', 'Action', 'Coffee Code', 'Supplier', 'GRN', 'Field Changed', 'Old Value', 'New Value'];
const fname = () => `warehouse-history-${format(new Date(), 'd-MMM-yyyy')}`;

export function exportHistoryPDF(history) {
  exportReportPDF({ title: 'Warehouse Receipt Change History', headers: HEADERS, rows: buildRows(history), filename: fname() });
}

export function exportHistoryExcel(history) {
  exportReportXLSX({ title: 'Warehouse Receipt Change History', headers: HEADERS, rows: buildRows(history), filename: fname() });
}
