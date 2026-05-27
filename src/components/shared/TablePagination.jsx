import React from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Reusable pagination bar with rows-per-page selector.
 *
 * Props:
 *   page         – current page (1-indexed)
 *   totalPages   – total number of pages
 *   total        – total records count
 *   pageSize     – current rows per page
 *   onPageChange – (newPage: number) => void
 *   onPageSize   – (newSize: number) => void
 */
export default function TablePagination({ page, totalPages, total, pageSize, onPageChange, onPageSize }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <span className="text-xs whitespace-nowrap">Rows per page</span>
        <Select value={String(pageSize)} onValueChange={v => { onPageSize(Number(v)); onPageChange(1); }}>
          <SelectTrigger className="h-8 w-[72px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map(n => (
              <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs whitespace-nowrap">
          Page <span className="font-semibold text-foreground">{page}</span> of <span className="font-semibold text-foreground">{totalPages}</span>
          <span className="ml-1 text-muted-foreground">({total.toLocaleString()} records)</span>
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={page === 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}