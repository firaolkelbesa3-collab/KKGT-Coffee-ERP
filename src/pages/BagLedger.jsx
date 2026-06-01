import React from 'react';
import jsPDF from 'jspdf';
import { format } from 'date-fns';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FileDown, Coins, PackageCheck, Recycle, Users, User, Building2 } from 'lucide-react';
import RoleGuard from '@/components/RoleGuard';
import BagReceiptsSection from '@/components/bagledger/BagReceiptsSection';
import RejectBagUsageSection from '@/components/bagledger/RejectBagUsageSection';
import SupplierBagSummary, { useSupplierBagSummary } from '@/components/bagledger/SupplierBagSummary';

function fmt(n, d = 0) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function SummaryCard({ icon: Icon, iconBg, iconColor, label, value, unit, sub }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-4">
      <div className={`rounded-lg p-3 ${iconBg}`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider leading-tight">{label}</p>
        <p className="text-2xl font-bold text-foreground">
          {value}{unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
        </p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function exportSummaryPDF(agentSummary, supplierSummary, agentTotals, supplierTotals) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 10;

  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(204, 85, 0);
  doc.text('Coffee ERP', margin, 12);
  doc.setTextColor(13, 100, 50);
  doc.setFontSize(11);
  doc.text('Bag Ledger — Summary', margin, 18);
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.setFont(undefined, 'normal');
  doc.text(`Generated: ${format(new Date(), 'd MMM yyyy HH:mm')}`, margin, 23);

  let y = 30;
  const renderSection = (title, rows, keyLabel) => {
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(13, 100, 50);
    doc.text(title, margin, y); y += 6;

    const headers = [keyLabel, 'Received', 'Loss (1%)', 'Used', 'Net to Return', 'Cash ETB', 'Paid ETB'];
    const colW = (pageW - margin * 2) / headers.length;
    doc.setFontSize(8);
    doc.setFillColor(13, 100, 50);
    doc.setTextColor(255, 255, 255);
    doc.rect(margin, y, pageW - margin * 2, 6, 'F');
    headers.forEach((h, i) => doc.text(h, margin + i * colW + 2, y + 4));
    y += 6;

    doc.setFont(undefined, 'normal');
    doc.setTextColor(20, 20, 20);
    rows.forEach((row, idx) => {
      if (y > doc.internal.pageSize.getHeight() - 15) { doc.addPage(); y = 15; }
      if (idx % 2 === 0) { doc.setFillColor(245, 245, 245); doc.rect(margin, y, pageW - margin * 2, 5, 'F'); }
      const cells = [row.key, fmt(row.received), fmt(row.lossAllowance), fmt(row.used), fmt(row.netToReturn), fmt(row.cashEarned, 2), fmt(row.totalPaid, 2)];
      cells.forEach((c, i) => { const s = String(c); doc.text(s.length > 20 ? s.slice(0, 20) + '…' : s, margin + i * colW + 2, y + 3.5); });
      y += 5;
    });
    y += 5;
  };

  renderSection('Section A — Agent Level', agentSummary, 'Agent');
  renderSection('Section B — Supplier Level', supplierSummary, 'Supplier');
  doc.save(`Bag_Ledger_Summary_${format(new Date(), 'yyyyMMdd')}.pdf`);
}

export default function BagLedger() {
  const { agentSummary, supplierSummary, agentTotals, supplierTotals, isLoading } = useSupplierBagSummary();

  return (
    <RoleGuard allowedRoles={['admin', 'warehouse_keeper', 'export_manager']}>
      <div>
        <PageHeader
          title="Bag Ledger"
          description="Bag tracking — receipts, reject usage, and settlements"
        >
          <Button variant="outline" onClick={() => exportSummaryPDF(agentSummary, supplierSummary, agentTotals, supplierTotals)}>
            <FileDown className="w-4 h-4 mr-1" /> Export PDF
          </Button>
        </PageHeader>

        {/* 4 Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <SummaryCard
            icon={User}
            iconBg="bg-green-100"
            iconColor="text-green-700"
            label="Bags to Return (Agent Level)"
            value={fmt(agentTotals.totalNetToReturn)}
            sub="Net bags owed back from agents"
          />
          <SummaryCard
            icon={Building2}
            iconBg="bg-orange-100"
            iconColor="text-orange-600"
            label="Bags to Return (Supplier Level)"
            value={fmt(supplierTotals.totalNetToReturn)}
            sub="Net bags owed back from suppliers"
          />
          <SummaryCard
            icon={Coins}
            iconBg="bg-primary/10"
            iconColor="text-primary"
            label="Cash Owed to Agents"
            value={fmt(agentTotals.totalCashRemaining, 0)}
            unit="ETB"
            sub="Unpaid reject bag cash — agent level"
          />
          <SummaryCard
            icon={Coins}
            iconBg="bg-secondary/15"
            iconColor="text-secondary"
            label="Cash Owed to Suppliers"
            value={fmt(supplierTotals.totalCashRemaining, 0)}
            unit="ETB"
            sub="Unpaid reject bag cash — supplier level"
          />
        </div>

        <Tabs defaultValue="receipts">
          <TabsList className="mb-5 bg-muted/60">
            <TabsTrigger value="receipts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
              <PackageCheck className="w-4 h-4" /> Bag Receipts
            </TabsTrigger>
            <TabsTrigger value="reject" className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground gap-2">
              <Recycle className="w-4 h-4" /> Reject Bag Usage
            </TabsTrigger>
            <TabsTrigger value="summary" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2">
              <Users className="w-4 h-4" /> Settlement Summary
            </TabsTrigger>
          </TabsList>

          <TabsContent value="receipts" className="mt-0">
            <BagReceiptsSection />
          </TabsContent>
          <TabsContent value="reject" className="mt-0">
            <RejectBagUsageSection />
          </TabsContent>
          <TabsContent value="summary" className="mt-0">
            <SupplierBagSummary agentSummary={agentSummary} supplierSummary={supplierSummary} isLoading={isLoading} />
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  );
}