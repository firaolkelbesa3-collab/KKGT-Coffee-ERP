import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const statusVariants = {
  'Paid': 'bg-accent/15 text-accent border-accent/20',
  'Pending': 'bg-chart-3/15 text-chart-3 border-chart-3/20',
  'Partial': 'bg-chart-4/15 text-chart-4 border-chart-4/20',
  'Completed': 'bg-accent/15 text-accent border-accent/20',
  'In Storage': 'bg-chart-5/15 text-chart-5 border-chart-5/20',
  'In Processing': 'bg-chart-3/15 text-chart-3 border-chart-3/20',
  'Ready for Export': 'bg-primary/15 text-primary border-primary/20',
  'Exported': 'bg-accent/15 text-accent border-accent/20',
  'Washing': 'bg-chart-5/15 text-chart-5 border-chart-5/20',
  'Drying': 'bg-chart-3/15 text-chart-3 border-chart-3/20',
  'Hulling': 'bg-chart-4/15 text-chart-4 border-chart-4/20',
  'Grading': 'bg-primary/15 text-primary border-primary/20',
  'Contract Signed': 'bg-chart-5/15 text-chart-5 border-chart-5/20',
  'Preparing': 'bg-chart-3/15 text-chart-3 border-chart-3/20',
  'In Transit': 'bg-chart-4/15 text-chart-4 border-chart-4/20',
  'Delivered': 'bg-accent/15 text-accent border-accent/20',
};

export function StatusBadge({ status }) {
  return (
    <Badge variant="outline" className={statusVariants[status] || 'bg-muted text-muted-foreground'}>
      {status}
    </Badge>
  );
}

export default function DataTable({ columns, data, isLoading, onRowClick, emptyMessage = "No data found" }) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden w-full max-w-full">
      <div className="overflow-x-auto w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow className="bg-muted/50">
              {columns.map((col, i) => (
                <TableHead key={i} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array(5).fill(0).map((_, i) => (
              <TableRow key={i}>
                {columns.map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden w-full max-w-full">
      <div className="overflow-x-auto w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              {columns.map((col, i) => (
                <TableHead key={i} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-12 text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, i) => (
                <TableRow 
                  key={row.id || i} 
                  className={onRowClick ? "cursor-pointer hover:bg-muted/30" : ""}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col, j) => (
                    <TableCell key={j} className="whitespace-nowrap">
                      {col.render ? col.render(row) : row[col.accessor]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}