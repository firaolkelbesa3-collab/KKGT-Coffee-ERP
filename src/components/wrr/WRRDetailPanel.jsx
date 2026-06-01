import React from 'react';
import { Button } from '@/components/ui/button';
import { X, Pencil, Printer } from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';

const fmt = (n) => (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Row({ label, value, valueClass }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium text-right max-w-[55%] break-words ${valueClass || ''}`}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-4">
      <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 pb-1 border-b border-border">{title}</h4>
      {children}
    </div>
  );
}

export default function WRRDetailPanel({ receipt, purchase, sampleKg, processingKg, onClose, onEdit }) {
  if (!receipt) return null;

  const shrinkage = (receipt.warehouse_received_net_kg || 0) - (receipt.net_dispatch_weight_kg || 0);
  const remaining = (receipt.warehouse_received_net_kg || 0) - (sampleKg || 0) - (processingKg || 0);

  const paymentStatus = purchase
    ? (Math.abs((purchase.balance_etb || 0)) < 1 ? '✅ Paid' : `⚠ Balance: ${fmt(purchase.balance_etb)} ETB`)
    : '—';

  const handlePrintPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    // Green header
    doc.setFillColor(18, 100, 51);
    doc.rect(0, 0, pageW, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('COFFEE ERP — ETHIOPIA', pageW / 2, 13, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('Warehouse Receipt', pageW / 2, 21, { align: 'center' });

    // Orange band
    doc.setFillColor(240, 103, 33);
    doc.rect(0, 30, pageW, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.text('CONFIDENTIAL', pageW / 2, 34.5, { align: 'center' });

    doc.setTextColor(0, 0, 0);
    let y = 46;
    const lx = 20;
    const vx = 100;

    const line = (label, value) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(label, lx, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value ?? '—'), vx, y);
      y += 7;
    };

    const divider = () => {
      doc.setDrawColor(200, 200, 200);
      doc.line(lx, y, pageW - lx, y);
      y += 5;
    };

    const sectionHeader = (title) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(18, 100, 51);
      doc.text(title, lx, y);
      doc.setTextColor(0, 0, 0);
      y += 6;
    };

    sectionHeader('RECEIPT DETAILS');
    divider();
    line('Coffee Code:', receipt.coffee_code || '—');
    line('GRN Code:', receipt.grn_code || '—');
    line('Dispatch No:', receipt.dispatch_no || '—');
    line('Received Date:', receipt.received_date ? format(new Date(receipt.received_date), 'd MMM yyyy') : '—');
    line('Supplier:', receipt.supplier_name || '—');
    y += 4;
    sectionHeader('KG SUMMARY');
    divider();
    line('Dispatch KG:', `${fmt(receipt.net_dispatch_weight_kg)} KG`);
    line('Received KG:', `${fmt(receipt.warehouse_received_net_kg)} KG`);
    line('Shrinkage:', `${shrinkage >= 0 ? '+' : ''}${fmt(shrinkage)} KG`);
    line('Bags Received:', String(receipt.bags_received || '—'));
    y += 4;

    if (purchase) {
      sectionHeader('LINKED PURCHASE');
      divider();
      line('Grand Total:', `${fmt(purchase.grand_total_etb)} ETB`);
      line('Total Paid:', `${fmt(purchase.total_paid_etb)} ETB`);
      line('Balance:', `${fmt(purchase.balance_etb)} ETB`);
      line('Status:', paymentStatus);
    }

    if (receipt.remark) {
      y += 4;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Remark:', lx, y);
      doc.setFont('helvetica', 'normal');
      doc.text(receipt.remark, lx + 20, y);
    }

    // Watermark
    doc.setTextColor(200, 200, 200);
    doc.setFontSize(60);
    doc.setFont('helvetica', 'bold');
    doc.text('CONFIDENTIAL', pageW / 2, 160, { align: 'center', angle: 45 });

    // Footer
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${format(new Date(), 'd MMM yyyy HH:mm')}`, lx, 285);
    doc.text('Page 1 of 1', pageW - lx, 285, { align: 'right' });

    doc.save(`KKGT-Receipt-${receipt.coffee_code || receipt.id}.pdf`);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-96 bg-card shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-border" style={{ background: '#6F4E37' }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono font-bold text-lg text-white">{receipt.coffee_code || '—'}</p>
              <p className="text-sm text-green-200 font-medium">{receipt.supplier_name || '—'}</p>
            </div>
            <button onClick={onClose} className="text-green-200 hover:text-white mt-1"><X className="w-5 h-5" /></button>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" variant="outline" className="flex-1 text-xs border-green-400 text-white hover:bg-green-700 bg-transparent" onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
            </Button>
            <Button size="sm" className="flex-1 text-xs bg-white text-[#6F4E37] hover:bg-green-50" onClick={handlePrintPDF}>
              <Printer className="w-3.5 h-3.5 mr-1" /> Print PDF
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          <Section title="Receipt Details">
            <Row label="Coffee Code" value={receipt.coffee_code || '—'} />
            <Row label="Supplier" value={receipt.supplier_name || '—'} />
            <Row label="GRN Code" value={receipt.grn_code || <span className="text-orange-500">⚠ Not entered</span>} />
            <Row label="Dispatch No" value={receipt.dispatch_no || <span className="text-orange-500">⚠ Not entered</span>} />
            <Row label="Received Date" value={receipt.received_date ? format(new Date(receipt.received_date), 'd MMM yyyy') : '—'} />
          </Section>

          <Section title="KG Summary">
            <Row label="Dispatch KG" value={`${fmt(receipt.net_dispatch_weight_kg)} KG`} />
            <Row label="Received KG" value={`${fmt(receipt.warehouse_received_net_kg)} KG`} valueClass="font-bold" />
            <Row
              label="Shrinkage"
              value={`${shrinkage >= 0 ? '+' : ''}${fmt(shrinkage)} KG`}
              valueClass={shrinkage < 0 ? 'text-destructive' : shrinkage > 0 ? 'text-green-600' : 'text-muted-foreground'}
            />
            <Row label="Samples KG" value={`${fmt(sampleKg)} KG`} />
            <Row label="Processing KG" value={`${fmt(processingKg)} KG`} />
            <Row
              label="Remaining KG"
              value={`${fmt(remaining)} KG`}
              valueClass={remaining <= 0 ? 'text-destructive font-bold' : remaining < 500 ? 'text-orange-500 font-bold' : 'text-green-600 font-bold'}
            />
            <Row label="Bags Received" value={receipt.bags_received ?? '—'} />
          </Section>

          {purchase && (
            <Section title="Linked Purchase">
              <Row label="Grand Total" value={`${fmt(purchase.grand_total_etb)} ETB`} />
              <Row label="Total Paid" value={`${fmt(purchase.total_paid_etb)} ETB`} />
              <Row label="Balance" value={`${fmt(purchase.balance_etb)} ETB`} />
              <Row label="Status" value={paymentStatus} valueClass={Math.abs(purchase.balance_etb || 0) < 1 ? 'text-green-600' : 'text-orange-500'} />
            </Section>
          )}

          <Section title="Remark">
            <p className="text-sm text-muted-foreground">{receipt.remark || '—'}</p>
          </Section>
        </div>
      </div>
    </>
  );
}