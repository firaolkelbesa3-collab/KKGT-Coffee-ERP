import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { base44 } from '@/api/supabaseClient';

function fmt(n) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function buildReport(purchases) {
  const active = purchases.filter(p => !p.archived);
  const exactDups = [];
  const nearDups = [];
  const codeDups = [];

  // Check coffee code duplicates (all records including archived)
  const codeMap = {};
  purchases.forEach(p => {
    if (!p.coffee_code) return;
    if (!codeMap[p.coffee_code]) codeMap[p.coffee_code] = [];
    codeMap[p.coffee_code].push(p);
  });
  Object.entries(codeMap).forEach(([code, group]) => {
    if (group.length > 1) codeDups.push({ code, records: group });
  });

  // Check exact and near duplicates (active only)
  const checked = new Set();
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      const pairKey = [a.id, b.id].sort().join('|');
      if (checked.has(pairKey)) continue;
      checked.add(pairKey);

      if (!a.supplier_name || !b.supplier_name || !a.purchase_date || !b.purchase_date) continue;
      if (a.supplier_name.trim().toLowerCase() !== b.supplier_name.trim().toLowerCase()) continue;

      const diff = Math.abs(differenceInCalendarDays(new Date(a.purchase_date), new Date(b.purchase_date)));
      if (diff === 0) {
        exactDups.push({ a, b });
      } else if (diff <= 3) {
        nearDups.push({ a, b, diff });
      }
    }
  }

  return { exactDups, nearDups, codeDups };
}

export default function DuplicateReport() {
  const [open, setOpen] = useState(false);

  const { data: purchases = [], isLoading, refetch } = useQuery({
    queryKey: ['purchase-records'],
    queryFn: () => base44.entities.PurchaseRecord.list('-created_date', 500),
    enabled: open,
  });

  const report = useMemo(() => buildReport(purchases), [purchases]);
  const total = report.exactDups.length + report.nearDups.length + report.codeDups.length;

  return (
    <>
      <Button variant="outline" className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => setOpen(true)}>
        <ShieldAlert className="w-4 h-4" />
        Check Duplicates
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-600" />
              Duplicate Purchase Report
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {total === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className="font-medium text-green-700">No duplicates found.</p>
                  <p className="text-sm">All purchases look clean.</p>
                </div>
              )}

              {/* Exact date duplicates */}
              {report.exactDups.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-semibold text-sm">Same Supplier + Same Date</h3>
                    <Badge className="bg-red-100 text-red-700 border-red-300">{report.exactDups.length} pair{report.exactDups.length > 1 ? 's' : ''}</Badge>
                  </div>
                  <div className="rounded-lg border border-red-200 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-red-50">
                          <TableHead className="text-xs">Supplier</TableHead>
                          <TableHead className="text-xs">Date</TableHead>
                          <TableHead className="text-xs">Code A</TableHead>
                          <TableHead className="text-xs">Grand Total A</TableHead>
                          <TableHead className="text-xs">Code B</TableHead>
                          <TableHead className="text-xs">Grand Total B</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.exactDups.map(({ a, b }, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium capitalize">{a.supplier_name}</TableCell>
                            <TableCell>{a.purchase_date ? format(new Date(a.purchase_date), 'd MMM yyyy') : '—'}</TableCell>
                            <TableCell className="font-mono text-xs text-primary">{a.coffee_code}</TableCell>
                            <TableCell className="text-right">{fmt(a.grand_total_etb)}</TableCell>
                            <TableCell className="font-mono text-xs text-primary">{b.coffee_code}</TableCell>
                            <TableCell className="text-right">{fmt(b.grand_total_etb)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}

              {/* Near date duplicates */}
              {report.nearDups.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-semibold text-sm">Same Supplier Within 3 Days</h3>
                    <Badge className="bg-amber-100 text-amber-700 border-amber-300">{report.nearDups.length} pair{report.nearDups.length > 1 ? 's' : ''}</Badge>
                  </div>
                  <div className="rounded-lg border border-amber-200 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-amber-50">
                          <TableHead className="text-xs">Supplier</TableHead>
                          <TableHead className="text-xs">Gap</TableHead>
                          <TableHead className="text-xs">Code A</TableHead>
                          <TableHead className="text-xs">Date A</TableHead>
                          <TableHead className="text-xs">Code B</TableHead>
                          <TableHead className="text-xs">Date B</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.nearDups.map(({ a, b, diff }, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium capitalize">{a.supplier_name}</TableCell>
                            <TableCell><Badge variant="outline" className="text-amber-700 border-amber-300">{diff} day{diff > 1 ? 's' : ''}</Badge></TableCell>
                            <TableCell className="font-mono text-xs text-primary">{a.coffee_code}</TableCell>
                            <TableCell>{a.purchase_date ? format(new Date(a.purchase_date), 'd MMM yyyy') : '—'}</TableCell>
                            <TableCell className="font-mono text-xs text-primary">{b.coffee_code}</TableCell>
                            <TableCell>{b.purchase_date ? format(new Date(b.purchase_date), 'd MMM yyyy') : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}

              {/* Code duplicates */}
              {report.codeDups.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="font-semibold text-sm">Duplicate Coffee Codes</h3>
                    <Badge className="bg-red-100 text-red-700 border-red-300">{report.codeDups.length} code{report.codeDups.length > 1 ? 's' : ''}</Badge>
                  </div>
                  <div className="rounded-lg border border-red-200 overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-red-50">
                          <TableHead className="text-xs">Coffee Code</TableHead>
                          <TableHead className="text-xs">Count</TableHead>
                          <TableHead className="text-xs">Records</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.codeDups.map(({ code, records }, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono font-medium text-destructive">{code}</TableCell>
                            <TableCell>{records.length}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {records.map(r => `${r.supplier_name} (${r.archived ? 'archived' : 'active'})`).join(' / ')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
