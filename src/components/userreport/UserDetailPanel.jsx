import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { format } from 'date-fns';

const ROLE_LABELS = {
  admin: 'Admin', supervisor: 'Supervisor', purchaser: 'Purchaser',
  warehouse_keeper: 'Warehouse', process_manager: 'Processing',
  final_registrar: 'Output', export_manager: 'Export',
};
const ROLE_COLORS = {
  admin: 'bg-purple-100 text-purple-700', supervisor: 'bg-blue-100 text-blue-700',
  purchaser: 'bg-green-100 text-green-700', warehouse_keeper: 'bg-amber-100 text-amber-700',
  process_manager: 'bg-orange-100 text-orange-700', final_registrar: 'bg-cyan-100 text-cyan-700',
  export_manager: 'bg-rose-100 text-rose-700',
};

function fmtDate(d) {
  if (!d) return '—';
  try { return format(new Date(d.slice(0, 10)), 'MMM d, yyyy'); } catch { return d; }
}
function fmt(n, dec = 0) {
  if (n == null || isNaN(n) || n === 0) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function EmptyRow({ colSpan, msg }) {
  return <TableRow><TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground text-sm">{msg}</TableCell></TableRow>;
}

function PurchasesTab({ purchases }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            {['Coffee Code', 'Date', 'Supplier', 'Region', 'Grand Total ETB', 'Status'].map(h => (
              <TableHead key={h} className="text-xs font-semibold uppercase text-muted-foreground">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchases.length === 0 ? (
            <EmptyRow colSpan={6} msg="No purchases created in this period" />
          ) : purchases.map(p => (
            <TableRow key={p.id} className="hover:bg-muted/20">
              <TableCell className="font-mono text-xs">{p.coffee_code || '—'}</TableCell>
              <TableCell className="whitespace-nowrap">{fmtDate(p.purchase_date)}</TableCell>
              <TableCell>{p.supplier_name || '—'}</TableCell>
              <TableCell>{p.region || '—'}</TableCell>
              <TableCell className="text-right font-medium">{fmt(p.grand_total_etb)}</TableCell>
              <TableCell>
                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.balance_etb <= 0 ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                  {p.balance_etb <= 0 ? 'Paid' : 'Balance'}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PaymentsTab({ payments }) {
  const total = payments.reduce((s, p) => s + (p.amount_etb || 0), 0);
  return (
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {['Date', 'Supplier', 'Coffee Code', 'Bank', 'CPV Reference', 'Type', 'Amount ETB'].map(h => (
                <TableHead key={h} className="text-xs font-semibold uppercase text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.length === 0 ? (
              <EmptyRow colSpan={7} msg="No payments recorded in this period" />
            ) : payments.map((p, i) => (
              <TableRow key={i} className="hover:bg-muted/20">
                <TableCell className="whitespace-nowrap">{fmtDate(p.payment_date)}</TableCell>
                <TableCell>{p.supplier_name || '—'}</TableCell>
                <TableCell className="font-mono text-xs">{p.coffee_code || '—'}</TableCell>
                <TableCell>{p.bank_name || '—'}</TableCell>
                <TableCell>{p.cpv_reference || '—'}</TableCell>
                <TableCell>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.payment_type === 'Final Payment' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {p.payment_type || '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right font-medium">{fmt(p.amount_etb)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {payments.length > 0 && (
        <div className="p-3 border-t border-border bg-muted/30 text-right text-sm font-semibold text-foreground">
          Total recorded: {fmt(total)} ETB
        </div>
      )}
    </div>
  );
}

function WarehouseTab({ receipts }) {
  const totalKg = receipts.reduce((s, r) => s + (r.warehouse_received_net_kg || 0), 0);
  return (
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {['Date', 'Coffee Code', 'Supplier', 'GRN Code', 'Received KG', 'Shrinkage KG', 'Bags'].map(h => (
                <TableHead key={h} className="text-xs font-semibold uppercase text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {receipts.length === 0 ? (
              <EmptyRow colSpan={7} msg="No warehouse receipts in this period" />
            ) : receipts.map(r => (
              <TableRow key={r.id} className="hover:bg-muted/20">
                <TableCell className="whitespace-nowrap">{fmtDate(r.received_date)}</TableCell>
                <TableCell className="font-mono text-xs">{r.coffee_code || '—'}</TableCell>
                <TableCell>{r.supplier_name || '—'}</TableCell>
                <TableCell>{r.grn_code || '—'}</TableCell>
                <TableCell className="text-right font-medium">{fmt(r.warehouse_received_net_kg)}</TableCell>
                <TableCell className="text-right">{r.net_dispatch_weight_kg && r.warehouse_received_net_kg ? fmt(r.net_dispatch_weight_kg - r.warehouse_received_net_kg) : '—'}</TableCell>
                <TableCell className="text-right">{r.bags_received ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {receipts.length > 0 && (
        <div className="p-3 border-t border-border bg-muted/30 text-right text-sm font-semibold text-foreground">
          Total KG received: {fmt(totalKg)} KG
        </div>
      )}
    </div>
  );
}

function ProcessingTab({ processing }) {
  const totalKg = processing.reduce((s, p) => s + (p.actual_weighed_kg ?? p.kg_sent ?? 0), 0);
  return (
    <div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {['Date', 'Supplier', 'Coffee Code', 'Mode', 'KG Sent', 'Actual KG', 'Batch No'].map(h => (
                <TableHead key={h} className="text-xs font-semibold uppercase text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {processing.length === 0 ? (
              <EmptyRow colSpan={7} msg="No processing entries in this period" />
            ) : processing.map(p => (
              <TableRow key={p.id} className="hover:bg-muted/20">
                <TableCell className="whitespace-nowrap">{fmtDate(p.date)}</TableCell>
                <TableCell>{p.supplier_name || '—'}</TableCell>
                <TableCell className="font-mono text-xs">{p.coffee_code || '—'}</TableCell>
                <TableCell>{p.entry_mode || '—'}</TableCell>
                <TableCell className="text-right">{fmt(p.kg_sent)}</TableCell>
                <TableCell className="text-right font-medium">{fmt(p.actual_weighed_kg)}</TableCell>
                <TableCell>{p.batch_no || '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {processing.length > 0 && (
        <div className="p-3 border-t border-border bg-muted/30 text-right text-sm font-semibold text-foreground">
          Total KG processed: {fmt(totalKg)} KG
        </div>
      )}
    </div>
  );
}

function OutputTab({ outputs }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            {['Date', 'Total KG Processed', 'Export KG', 'Reject KG', 'Waste KG', 'Reject %', 'Registrar'].map(h => (
              <TableHead key={h} className="text-xs font-semibold uppercase text-muted-foreground">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {outputs.length === 0 ? (
            <EmptyRow colSpan={7} msg="No output reports in this period" />
          ) : outputs.map(o => (
            <TableRow key={o.id} className="hover:bg-muted/20">
              <TableCell className="whitespace-nowrap">{fmtDate(o.date)}</TableCell>
              <TableCell className="text-right">{fmt(o.total_kg_processed)}</TableCell>
              <TableCell className="text-right text-green-700 font-medium">{fmt(o.export_kg)}</TableCell>
              <TableCell className="text-right text-orange-600">{fmt(o.reject_kg)}</TableCell>
              <TableCell className="text-right text-destructive">{fmt(o.waste_kg)}</TableCell>
              <TableCell className="text-right">{o.reject_pct != null ? `${o.reject_pct.toFixed(1)}%` : '—'}</TableCell>
              <TableCell>{o.registrar_name || '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function UserDetailPanel({ user, data, dateRange, onClose }) {
  const totalActions = (data.userPurchases.length + data.userPayments.length + data.userReceipts.length + data.userProcessing.length + data.userOutputs.length);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-3xl bg-background shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-sm">
              {(user.name || user.email).slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">{user.name}</span>
                {user.role && (
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${ROLE_COLORS[user.role] || 'bg-muted text-muted-foreground'}`}>
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{user.email} · {totalActions} action{totalActions !== 1 ? 's' : ''} in period</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
        </div>

        {/* Tabs */}
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="purchases" className="flex flex-col h-full">
            <div className="px-5 pt-3 border-b border-border bg-card">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="purchases">Purchases ({data.userPurchases.length})</TabsTrigger>
                <TabsTrigger value="payments">Payments ({data.userPayments.length})</TabsTrigger>
                <TabsTrigger value="warehouse">Warehouse ({data.userReceipts.length})</TabsTrigger>
                <TabsTrigger value="processing">Processing ({data.userProcessing.length})</TabsTrigger>
                <TabsTrigger value="output">Output ({data.userOutputs.length})</TabsTrigger>
              </TabsList>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TabsContent value="purchases" className="mt-0"><PurchasesTab purchases={data.userPurchases} /></TabsContent>
              <TabsContent value="payments" className="mt-0"><PaymentsTab payments={data.userPayments} /></TabsContent>
              <TabsContent value="warehouse" className="mt-0"><WarehouseTab receipts={data.userReceipts} /></TabsContent>
              <TabsContent value="processing" className="mt-0"><ProcessingTab processing={data.userProcessing} /></TabsContent>
              <TabsContent value="output" className="mt-0"><OutputTab outputs={data.userOutputs} /></TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </>
  );
}