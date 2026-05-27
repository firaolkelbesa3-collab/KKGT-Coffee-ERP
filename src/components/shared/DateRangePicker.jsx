import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, isSameDay, isWithinInterval, startOfDay } from 'date-fns';

const QUICK_PRESETS = [
  { label: 'Today', get: () => { const d = new Date(); return [d, d]; } },
  { label: 'Yesterday', get: () => { const d = new Date(); d.setDate(d.getDate() - 1); return [d, d]; } },
  { label: 'This Month', get: () => [startOfMonth(new Date()), endOfMonth(new Date())] },
  { label: 'Last Month', get: () => { const lm = subMonths(new Date(), 1); return [startOfMonth(lm), endOfMonth(lm)]; } },
  { label: 'This Year', get: () => [startOfYear(new Date()), endOfYear(new Date())] },
];

function toYMD(d) {
  if (!d) return '';
  return format(d, 'yyyy-MM-dd');
}

function MonthCalendar({ year, month, rangeStart, rangeEnd, hoveredDate, onDayClick, onDayHover }) {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow = firstDay.getDay(); // 0=Sun

  const weeks = [];
  let week = [];
  // pad start
  for (let i = 0; i < startDow; i++) week.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) { weeks.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  const effectiveEnd = rangeEnd || hoveredDate;

  return (
    <div className="min-w-[230px]">
      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day, di) => {
            if (!day) return <div key={di} />;
            const isStart = rangeStart && isSameDay(day, rangeStart);
            const isEnd = rangeEnd && isSameDay(day, rangeEnd);
            const inRange = rangeStart && effectiveEnd &&
              isWithinInterval(startOfDay(day), {
                start: startOfDay(rangeStart <= effectiveEnd ? rangeStart : effectiveEnd),
                end: startOfDay(rangeStart <= effectiveEnd ? effectiveEnd : rangeStart),
              });
            const isToday = isSameDay(day, new Date());

            return (
              <button
                key={di}
                type="button"
                onClick={() => onDayClick(day)}
                onMouseEnter={() => onDayHover(day)}
                className={[
                  'relative h-8 text-xs font-medium rounded transition-colors',
                  isStart || isEnd
                    ? 'text-white'
                    : inRange
                      ? 'bg-orange-50 text-orange-800'
                      : 'hover:bg-muted text-foreground',
                  isToday && !isStart && !isEnd ? 'ring-1 ring-inset ring-orange-400' : '',
                ].join(' ')}
                style={isStart || isEnd ? { backgroundColor: '#f06721' } : {}}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * DateRangePicker
 * Props:
 *   from: string 'YYYY-MM-DD' | ''
 *   to:   string 'YYYY-MM-DD' | ''
 *   onChange: ({ from, to }) => void
 *   placeholder?: string
 */
export default function DateRangePicker({ from, to, onChange, placeholder = 'Select date range' }) {
  const [open, setOpen] = useState(false);
  const [leftMonth, setLeftMonth] = useState(() => {
    if (from) { const d = new Date(from); return { year: d.getFullYear(), month: d.getMonth() }; }
    return { year: new Date().getFullYear(), month: new Date().getMonth() - 1 < 0 ? 11 : new Date().getMonth() - 1 };
  });
  // draft state while panel is open
  const [draft, setDraft] = useState({ start: from ? new Date(from) : null, end: to ? new Date(to) : null });
  const [selecting, setSelecting] = useState(false); // awaiting second click
  const [hovered, setHovered] = useState(null);
  const panelRef = useRef(null);

  // Sync draft when external from/to change
  useEffect(() => {
    if (!open) {
      setDraft({ start: from ? new Date(from) : null, end: to ? new Date(to) : null });
    }
  }, [from, to, open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const rightMonth = { year: leftMonth.month === 11 ? leftMonth.year + 1 : leftMonth.year, month: leftMonth.month === 11 ? 0 : leftMonth.month + 1 };

  const prevMonth = () => setLeftMonth(p => p.month === 0 ? { year: p.year - 1, month: 11 } : { year: p.year, month: p.month - 1 });
  const nextMonth = () => setLeftMonth(p => p.month === 11 ? { year: p.year + 1, month: 0 } : { year: p.year, month: p.month + 1 });

  const handleDayClick = (day) => {
    if (!selecting) {
      setDraft({ start: day, end: null });
      setSelecting(true);
    } else {
      const s = draft.start;
      const newDraft = s && day < s ? { start: day, end: s } : { start: s, end: day };
      setDraft(newDraft);
      setSelecting(false);
      setHovered(null);
    }
  };

  const handlePreset = ([s, e]) => {
    setDraft({ start: s, end: e });
    setSelecting(false);
  };

  const handleApply = () => {
    onChange({ from: toYMD(draft.start), to: toYMD(draft.end) });
    setOpen(false);
  };

  const handleClear = () => {
    setDraft({ start: null, end: null });
    onChange({ from: '', to: '' });
    setOpen(false);
  };

  const displayLabel = from && to
    ? `${from} → ${to}`
    : from
      ? `${from} →`
      : placeholder;

  const hasValue = !!(from || to);

  return (
    <div className="relative inline-block" ref={panelRef}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 h-9 px-3 rounded-lg border text-sm transition-colors
          ${hasValue ? 'border-orange-400 bg-orange-50 text-orange-800 font-medium' : 'border-border bg-background text-muted-foreground hover:border-primary/50'}`}
      >
        <Calendar className="w-4 h-4 flex-shrink-0" style={{ color: hasValue ? '#f06721' : undefined }} />
        <span className="whitespace-nowrap">{displayLabel}</span>
        {hasValue && (
          <span
            onClick={(e) => { e.stopPropagation(); handleClear(); }}
            className="ml-1 rounded-full hover:bg-orange-200 p-0.5 transition-colors"
          >
            <X className="w-3 h-3" />
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute z-50 top-11 left-0 bg-white border border-border rounded-2xl shadow-2xl overflow-hidden"
          style={{ minWidth: 540 }}
        >
          <div className="flex">
            {/* Quick presets sidebar */}
            <div className="w-36 border-r border-border bg-gray-50 p-3 space-y-1 flex-shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">Quick Select</p>
              {QUICK_PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePreset(p.get())}
                  className="w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-white font-medium text-foreground transition-colors"
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="flex-1 p-4">
              {/* Selected range display */}
              <div className="text-xs font-semibold text-center mb-3 h-5">
                {draft.start && draft.end
                  ? <span style={{ color: '#f06721' }}>{toYMD(draft.start)} → {toYMD(draft.end)}</span>
                  : draft.start
                    ? <span className="text-muted-foreground">Select end date…</span>
                    : <span className="text-muted-foreground">Select start date</span>
                }
              </div>

              {/* Month navigation */}
              <div className="flex items-center justify-between mb-3">
                <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-muted transition-colors">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex gap-8">
                  <span className="text-sm font-semibold">{format(new Date(leftMonth.year, leftMonth.month, 1), 'MMMM yyyy')}</span>
                  <span className="text-sm font-semibold">{format(new Date(rightMonth.year, rightMonth.month, 1), 'MMMM yyyy')}</span>
                </div>
                <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-muted transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-6">
                <MonthCalendar year={leftMonth.year} month={leftMonth.month} rangeStart={draft.start} rangeEnd={draft.end} hoveredDate={selecting ? hovered : null} onDayClick={handleDayClick} onDayHover={setHovered} />
                <MonthCalendar year={rightMonth.year} month={rightMonth.month} rangeStart={draft.start} rangeEnd={draft.end} hoveredDate={selecting ? hovered : null} onDayClick={handleDayClick} onDayHover={setHovered} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-gray-50">
            <button type="button" onClick={handleClear} className="text-sm text-destructive hover:text-destructive/80 font-medium">
              Clear
            </button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                type="button"
                size="sm"
                onClick={handleApply}
                disabled={!draft.start}
                style={{ backgroundColor: '#f06721', borderColor: '#f06721' }}
                className="text-white hover:opacity-90"
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}