import React from 'react';
import { Button } from '@/components/ui/button';
import { FileText, FileSpreadsheet } from 'lucide-react';

export default function ExportBar({ onPDF, onXLSX }) {
  return (
    <div className="flex justify-end gap-2 mb-3">
      {onPDF && (
        <Button size="sm" variant="outline" onClick={onPDF} className="gap-1.5 text-xs">
          <FileText className="w-3.5 h-3.5" /> Export PDF
        </Button>
      )}
      {onXLSX && (
        <Button size="sm" variant="outline" onClick={onXLSX} className="gap-1.5 text-xs">
          <FileSpreadsheet className="w-3.5 h-3.5" /> Export Excel
        </Button>
      )}
    </div>
  );
}