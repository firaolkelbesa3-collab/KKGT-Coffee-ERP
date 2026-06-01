import React, { useMemo, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

function fmt(n, d = 2) {
  if (n == null || isNaN(n) || n === '') return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtD(d) {
  try { return d ? format(new Date(d), 'dd/MM/yyyy') : '—'; } catch { return d || '—'; }
}

// Extract bank: prefer direct bank_name field, fall back to payment_history
function getBank(contract) {
  if (contract.bank_name) return contract.bank_name;
  try {
    const payments = JSON.parse(contract.payment_history || '[]');
    const bank = payments.find(p => p.bank_name)?.bank_name;
    return bank || '—';
  } catch { return '—'; }
}

const COLS = [
  { key: '#',              label: '#',                    width: 40,  align: 'center', frozen: true },
  { key: 'contract_no',   label: 'Contract No',          width: 150, align: 'left',   frozen: true },
  { key: 'pi_number',     label: 'PI Number',            width: 160, align: 'left'   },
  { key: 'destination',   label: 'Destination',          width: 110, align: 'left'   },
  { key: 'commodity',     label: 'Commodity',            width: 170, align: 'left'   },
  { key: 'export_kg',     label: 'Export KG',            width: 110, align: 'right'  },
  { key: 'export_date',   label: 'Export Date',          width: 110, align: 'center' },
  { key: 'total_usd',     label: 'Total USD',            width: 130, align: 'right'  },
  { key: 'usd_rate',      label: 'USD Rate',             width: 100, align: 'right'  },
  { key: 'total_expenses',label: 'Total Expenses ETB',   width: 160, align: 'right'  },
  { key: 'export_sales',  label: 'Export Sales ETB',     width: 160, align: 'right'  },
  { key: 'reject_sales',  label: 'Reject Sales ETB',     width: 140, align: 'right'  },
  { key: 'grand_total',   label: 'Grand Total Sales ETB',width: 180, align: 'right'  },
  { key: 'bank',          label: 'Bank',                 width: 90,  align: 'left'   },
  { key: 'pay_terms',     label: 'Payment Terms',        width: 140, align: 'left'   },
  { key: 'profit_etb',    label: 'Total Profit ETB',     width: 150, align: 'right'  },
  { key: 'profit_usd',    label: 'Profit USD',           width: 120, align: 'right'  },
  { key: 'status',        label: 'Status',               width: 100, align: 'center' },
];

function getRowData(r, index) {
  const contractRate = r.contract_rate_etb || r.usd_rate_etb || 0;
  const rateMissing = !(contractRate > 0);
  const profitEtb = r.profit_etb ?? r.total_profit_etb ?? null;
  const payTerms = r.payment_terms === 'Other' ? (r.custom_payment_terms || 'Other') : (r.payment_terms || '—');
  return {
    '#': index + 1,
    contract_no: r.contract_no || '—',
    pi_number: r.contract_pi_number || '—',
    destination: r.destination_country || '—',
    commodity: r.coffee_type || r.commodity || '—',
    export_kg: r.export_kg != null ? Number(r.export_kg) : null,
    export_date: r.contract_date || r.export_date || null,
    total_usd: r.total_export_value_usd != null ? Number(r.total_export_value_usd) : null,
    usd_rate: contractRate > 0 ? contractRate : null,
    total_expenses: r.total_costs_etb || r.total_expenses_etb || null,
    export_sales: r.total_export_value_etb || r.export_total_sales_price_etb || null,
    reject_sales: r.reject_sales_etb || r.total_reject_sales_etb || null,
    grand_total: r.grand_total_revenue_etb || r.grand_total_sales_etb || null,
    bank: getBank(r),
    pay_terms: payTerms,
    profit_etb: !rateMissing ? profitEtb : null,
    profit_usd: !rateMissing ? (r.profit_usd ?? null) : null,
    status: r.status || 'Pending',
    _rateMissing: rateMissing,
    _id: r.id,
  };
}

function cellDisplay(col, val, row) {
  if (col.key === '#') return val;
  if (col.key === 'status') {
    const colors = { Pending: 'text-amber-700', 'In Progress': 'text-blue-700', Shipped: 'text-indigo-700', Completed: 'text-green-700' };
    return <span className={`font-semibold ${colors[val] || ''}`}>{val}</span>;
  }
  if (col.key === 'export_date') return val ? fmtD(val) : '—';
  if (col.key === 'usd_rate') return val != null ? fmt(val, 4) : '—';
  if (col.key === 'export_kg') return val != null ? fmt(val, 0) : '—';
  if (['total_usd'].includes(col.key)) return val != null ? `$${fmt(val, 2)}` : '—';
  if (['profit_usd'].includes(col.key)) {
    if (val == null) return '—';
    const color = val >= 0 ? 'text-green-700' : 'text-red-600';
    return <span className={`font-semibold ${color}`}>${fmt(val, 2)}</span>;
  }
  if (['total_expenses', 'export_sales', 'reject_sales', 'grand_total', 'profit_etb'].includes(col.key)) {
    if (val == null) return '—';
    if (col.key === 'profit_etb') {
      const color = val >= 0 ? 'text-green-700' : 'text-red-600';
      return <span className={`font-semibold ${color}`}>{fmt(val, 0)}</span>;
    }
    return fmt(val, 0);
  }
  return val ?? '—';
}

export default function ExportContractsReportTable({ contracts = [], isLoading }) {
  const tableRef = useRef(null);

  const rows = useMemo(() => contracts.map((r, i) => getRowData(r, i)), [contracts]);

  // Totals
  const totals = useMemo(() => {
    const sum = key => rows.reduce((s, r) => s + (typeof r[key] === 'number' ? r[key] : 0), 0);
    return {
      export_kg: sum('export_kg'),
      total_usd: sum('total_usd'),
      profit_etb: sum('profit_etb'),
      profit_usd: sum('profit_usd'),
    };
  }, [rows]);

  // Frozen column left offsets
  const frozenLeftOffset = [0, 40]; // # at 0, Contract No at 40px

  function exportPDF() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const W = 297, M = 8;
    doc.setFillColor(18, 100, 51);
    doc.rect(0, 0, W, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('Coffee ERP — Export Contracts Report', M, 12);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, W - M, 12, { align: 'right' });

    let y = 24;
    const colKeys = COLS.map(c => c.key);
    const colLabels = COLS.map(c => c.label);
    const colWidths = [8, 30, 30, 22, 28, 20, 20, 22, 16, 28, 28, 24, 28, 18, 26, 26, 22, 18];

    // Header
    doc.setFillColor(240, 240, 240); doc.rect(M, y - 4, W - M * 2, 6, 'F');
    doc.setTextColor(50, 50, 50); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold');
    let x = M;
    colLabels.forEach((lbl, i) => {
      doc.text(lbl, x + colWidths[i] / 2, y, { align: 'center', maxWidth: colWidths[i] - 1 });
      x += colWidths[i];
    });
    y += 5;

    // Rows
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5);
    rows.forEach((row, ri) => {
      if (y > 195) { doc.addPage(); y = 15; }
      if (ri % 2 === 0) { doc.setFillColor(249, 249, 249); doc.rect(M, y - 3.5, W - M * 2, 5, 'F'); }
      x = M;
      colKeys.forEach((key, i) => {
        let val = row[key];
        let text = '—';
        if (key === 'export_date' && val) text = fmtD(val);
        else if (key === 'export_kg' && val != null) text = fmt(val, 0);
        else if (key === 'total_usd' && val != null) text = `$${fmt(val, 2)}`;
        else if (key === 'profit_usd' && val != null) text = `$${fmt(val, 2)}`;
        else if (['usd_rate'].includes(key) && val != null) text = fmt(val, 4);
        else if (['total_expenses','export_sales','reject_sales','grand_total','profit_etb'].includes(key) && val != null) text = fmt(val, 0);
        else if (val != null && val !== '—') text = String(val);
        doc.setTextColor(50, 50, 50);
        doc.text(text, x + colWidths[i] / 2, y, { align: 'center', maxWidth: colWidths[i] - 1 });
        x += colWidths[i];
      });
      y += 5;
    });

    // Totals row
    y += 2;
    doc.setFillColor(220, 240, 220); doc.rect(M, y - 3.5, W - M * 2, 5.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(18, 100, 51);
    x = M;
    colKeys.forEach((key, i) => {
      let text = '';
      if (key === '#') text = 'TOTAL';
      else if (key === 'export_kg') text = fmt(totals.export_kg, 0);
      else if (key === 'total_usd') text = `$${fmt(totals.total_usd, 2)}`;
      else if (key === 'profit_etb') text = fmt(totals.profit_etb, 0);
      else if (key === 'profit_usd') text = `$${fmt(totals.profit_usd, 2)}`;
      if (text) doc.text(text, x + colWidths[i] / 2, y, { align: 'center', maxWidth: colWidths[i] - 1 });
      x += colWidths[i];
    });

    doc.save(`CoffeeERP-Export-Contracts-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function exportExcel() {
    const header = COLS.map(c => c.label);
    const dataRows = rows.map(row => COLS.map(col => {
      const val = row[col.key];
      if (col.key === 'export_date' && val) return fmtD(val);
      if (['export_kg','total_usd','usd_rate','total_expenses','export_sales','reject_sales','grand_total','profit_etb','profit_usd'].includes(col.key)) {
        return val != null ? Number(val) : '';
      }
      return val != null ? val : '';
    }));

    // Totals row
    const totalsRow = COLS.map(col => {
      if (col.key === '#') return 'TOTAL';
      if (col.key === 'export_kg') return totals.export_kg;
      if (col.key === 'total_usd') return totals.total_usd;
      if (col.key === 'profit_etb') return totals.profit_etb;
      if (col.key === 'profit_usd') return totals.profit_usd;
      return '';
    });

    const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows, totalsRow]);
    // Column widths
    ws['!cols'] = COLS.map(c => ({ wch: Math.round(c.width / 7) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Export Contracts');
    XLSX.writeFile(wb, `CoffeeERP-Export-Contracts-Report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 space-y-2">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Export buttons */}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={exportExcel} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> Excel
        </Button>
        <Button size="sm" variant="outline" onClick={exportPDF} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> PDF
        </Button>
      </div>

      {/* Table with horizontal scroll + frozen columns */}
      <div className="rounded-xl border border-border bg-card overflow-hidden w-full max-w-full min-w-0">
        <div className="overflow-x-auto w-full min-w-0" ref={tableRef} style={{ position: 'relative', WebkitOverflowScrolling: 'touch' }}>
          <table className="text-sm border-collapse" style={{ minWidth: COLS.reduce((s, c) => s + c.width, 0) }}>
            <thead>
              <tr className="bg-muted/60 border-b border-border">
                {COLS.map((col, ci) => {
                  const isFrozen = col.frozen;
                  const leftOffset = ci === 0 ? 0 : ci === 1 ? COLS[0].width : undefined;
                  return (
                    <th
                      key={col.key}
                      className={`
                        text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground
                        px-2 py-2.5 whitespace-nowrap border-r border-border/40 last:border-r-0
                        ${isFrozen ? 'sticky z-10 bg-muted/80' : ''}
                      `}
                      style={{
                        minWidth: col.width,
                        width: col.width,
                        left: isFrozen ? leftOffset : undefined,
                      }}
                    >
                      {col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLS.length} className="text-center py-12 text-muted-foreground text-sm">
                    No contracts match your search.
                  </td>
                </tr>
              ) : (
                <>
                  {rows.map((row, ri) => (
                    <tr key={row._id} className={`border-b border-border/40 hover:bg-muted/20 ${row._rateMissing ? 'bg-amber-50/30' : ri % 2 === 0 ? '' : 'bg-muted/10'}`}>
                      {COLS.map((col, ci) => {
                        const isFrozen = col.frozen;
                        const leftOffset = ci === 0 ? 0 : ci === 1 ? COLS[0].width : undefined;
                        const val = row[col.key];
                        return (
                          <td
                            key={col.key}
                            className={`
                              px-2 py-2 whitespace-nowrap border-r border-border/30 last:border-r-0
                              text-${col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left'}
                              ${isFrozen ? 'sticky z-10 bg-inherit' : ''}
                              ${col.key === 'contract_no' ? 'font-mono text-xs font-semibold text-primary' : 'text-sm'}
                            `}
                            style={{
                              minWidth: col.width,
                              width: col.width,
                              left: isFrozen ? leftOffset : undefined,
                              backgroundColor: isFrozen ? (row._rateMissing ? 'hsl(48 100% 97% / 0.9)' : (ri % 2 === 0 ? 'white' : 'hsl(var(--muted) / 0.1)')) : undefined,
                            }}
                          >
                            {cellDisplay(col, val, row)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* Totals row */}
                  <tr className="border-t-2 border-primary/30 bg-primary/5 font-bold">
                    {COLS.map((col, ci) => {
                      const isFrozen = col.frozen;
                      const leftOffset = ci === 0 ? 0 : ci === 1 ? COLS[0].width : undefined;
                      let content = '';
                      if (col.key === '#') content = <span className="text-xs text-muted-foreground font-semibold">TOTAL</span>;
                      else if (col.key === 'export_kg') content = <span className="text-primary">{fmt(totals.export_kg, 0)}</span>;
                      else if (col.key === 'total_usd') content = <span className="text-primary">${fmt(totals.total_usd, 2)}</span>;
                      else if (col.key === 'profit_etb') content = <span className="text-green-700">{fmt(totals.profit_etb, 0)}</span>;
                      else if (col.key === 'profit_usd') content = <span className="text-green-700">${fmt(totals.profit_usd, 2)}</span>;
                      else if (['pi_number','bank'].includes(col.key)) content = '—';
                      return (
                        <td
                          key={col.key}
                          className={`
                            px-2 py-2.5 whitespace-nowrap border-r border-border/30 last:border-r-0
                            text-${col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left'}
                            ${isFrozen ? 'sticky z-20 bg-primary/5' : ''}
                          `}
                          style={{
                            minWidth: col.width,
                            width: col.width,
                            left: isFrozen ? leftOffset : undefined,
                          }}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}