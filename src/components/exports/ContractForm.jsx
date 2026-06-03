import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Plus, X } from 'lucide-react';
import { InlineWarningList } from '@/components/notifications/InlineWarning';
import { getExportContractWarnings } from '@/lib/formWarnings';
import NumberInput from '@/components/shared/NumberInput';

function fmt(n, d = 2) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

const LB_CONVERSION = 2.2046;

const PAYMENT_TERMS = ['Letter of Credit (LC)', 'Cash Against Documents (CAD)', 'Advance Payment', 'Open Account', 'Other'];

const EXPORT_MATERIALS_COST_NAME = 'Export Materials';

const DEFAULT_COST_NAMES = [
  'Purchase Cost ETB',
  'Commission on Purchase ETB',
  'Cleaning Charges ETB',
  'Recleaning Charges ETB',
  'Packing Bag and Green Pro ETB',
  'Bag Mark Craft ETB',
  'Bag Printing ETB',
  'Loading and Unloading ETB',
  'Warehouse Expenses ETB',
  'Local Transportation ETB',
  'EDR Clearance and Train Fee ETB',
  'Demurrage ETB',
  'Freight ETB',
  'Commission on Sales ETB',
  'BL Fee / Container Fee ETB',
  'Fumigation ETB',
  'COO ETB',
  'Container Picking ETB',
  'ICO ETB',
  'Private Co Weight/Quality Exp ETB',
  'Coffee Association ETB',
  'Plomp Payment ETB',
  'Other Costs ETB',
];

function generateContractNo(count) {
  const year = new Date().getFullYear();
  return `KKGT/EXP/${String(count + 1).padStart(3, '0')}/${year}`;
}

// ─── Read-only display field ─────────────────────────────────────────────────
function RO({ label, value, green, red, large }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className={`px-3 py-2 rounded-md border border-input bg-muted font-semibold text-sm ${large ? 'text-base' : ''} ${green ? 'text-green-700' : red ? 'text-destructive' : ''}`}>
        {value}
      </div>
    </div>
  );
}

// ─── Arrival Input Row ────────────────────────────────────────────────────────
function ArrivalRow({ row, onChange, onRemove }) {
  const bags = parseFloat(row.bags) || 0;
  const price = parseFloat(row.price_etb) || 0;
  const feresula = bags * 85 / 17;
  const amount = feresula * price;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end border border-border rounded-lg p-3 bg-muted/10">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Bags</Label>
        <NumberInput decimals={0} value={row.bags || ''} onChange={v => onChange({ ...row, bags: v })} placeholder="0" className="h-9 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Price ETB/Feresula</Label>
        <NumberInput decimals={2} value={row.price_etb || ''} onChange={v => onChange({ ...row, price_etb: v })} placeholder="0.00" className="h-9 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Feresula (auto)</Label>
        <Input value={fmt(feresula, 0)} readOnly className="h-9 bg-muted text-xs font-semibold" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Amount ETB (auto)</Label>
        <Input value={fmt(amount, 0)} readOnly className="h-9 bg-muted text-xs font-semibold" />
      </div>
      <div className="flex items-end">
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={onRemove}>
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Cost Row ─────────────────────────────────────────────────────────────────
function CostRow({ row, onChange, onRemove, readOnlyAmount }) {
  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1 space-y-1">
        <Input value={row.name || ''} onChange={e => onChange({ ...row, name: e.target.value })} placeholder="Cost name" className="h-9 text-xs" readOnly={readOnlyAmount} />
      </div>
      <div className="w-44 space-y-1">
        {readOnlyAmount ? (
          <Input value={fmt(parseFloat(row.amount_etb) || 0)} readOnly className="h-9 bg-muted text-xs font-semibold" />
        ) : (
          <NumberInput decimals={2} value={row.amount_etb || ''} onChange={v => onChange({ ...row, amount_etb: v })} placeholder="0.00" className="h-9 text-xs" />
        )}
      </div>
      {readOnlyAmount ? (
        <div className="h-9 w-9 flex-shrink-0" />
      ) : (
        <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-destructive flex-shrink-0" onClick={onRemove}>
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

// ─── Main ContractForm ────────────────────────────────────────────────────────
export default function ContractForm({ open, onOpenChange, initialData, contractCount, availableStock, availableStockRecleaned = {}, masterCoffeeTypes, onSubmit, isSubmitting }) {
  const [form, setForm] = useState({});
  const [step, setStep] = useState(1); // 2-step form: 1 = Contract & Pricing, 2 = Costs & Profit
  const [pricingMethod, setPricingMethod] = useState('per_lb'); // 'per_lb' | 'per_kg'
  const [stockPool, setStockPool] = useState('Fresh'); // 'Fresh' | 'Recleaned'
  const [costRows, setCostRows] = useState([]);
  const [arrivalRows, setArrivalRows] = useState([]);
  const [materialRows, setMaterialRows] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingData, setPendingData] = useState(null);
  const [originalDestination, setOriginalDestination] = useState('');
  const [kgError, setKgError] = useState('');

  const isEdit = !!initialData;

  useEffect(() => {
    if (!open) return;
    setStep(1); // always open at step 1
    if (initialData) {
      setForm({ ...initialData });
      setOriginalDestination(initialData.destination_country || '');
      setStockPool(initialData.stock_pool || 'Fresh');
      // detect pricing method
      setPricingMethod(initialData.pricing_method || (initialData.price_per_lb_usd ? 'per_lb' : 'per_kg'));
      try {
        const rows = JSON.parse(initialData.cost_rows || '[]');
        setCostRows(rows.length ? rows : DEFAULT_COST_NAMES.map(n => ({ name: n, amount_etb: '' })));
      } catch { setCostRows(DEFAULT_COST_NAMES.map(n => ({ name: n, amount_etb: '' }))); }
      try {
        const arr = JSON.parse(initialData.arrival_inputs || '[]');
        setArrivalRows(arr.length ? arr : []);
      } catch { setArrivalRows([]); }
      try {
        const mats = JSON.parse(initialData.material_rows || '[]');
        setMaterialRows(mats.length ? mats : []);
      } catch { setMaterialRows([]); }
    } else {
      setForm({
        contract_no: generateContractNo(contractCount),
        contract_date: todayStr(),
        coffee_type: '', coffee_grade: '', destination_country: '', buyer_name: '',
        payment_terms: '', expected_payment_date: '',
        export_kg: '', export_sample_kg: '',
        price_per_lb_usd: '', price_per_kg_usd: '',
        contract_rate_etb: '', reject_sales_etb: '', remark: '', status: 'Pending',
      });
      setPricingMethod('per_lb');
      setStockPool('Fresh');
      setCostRows(DEFAULT_COST_NAMES.map(n => ({ name: n, amount_etb: '' })));
      setArrivalRows([]);
      setMaterialRows([{ name: 'Jute Bags', quantity: '', unit_cost_etb: '' }]);
    }
    setKgError('');
  }, [open, initialData, contractCount]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // ── Derived quantities ────────────────────────────────────────────────────
  const exportKg = parseFloat(form.export_kg) || 0;
  const exportSampleKg = parseFloat(form.export_sample_kg) || 0;
  const actualShippedKg = Math.max(0, exportKg - exportSampleKg);
  const exportBags = Math.floor(exportKg / 60);

  const totalLb = actualShippedKg * LB_CONVERSION;

  const pricePerLb = parseFloat(form.price_per_lb_usd) || 0;
  const pricePerKg = parseFloat(form.price_per_kg_usd) || 0;
  const totalUsd = pricingMethod === 'per_lb'
    ? totalLb * pricePerLb
    : actualShippedKg * pricePerKg;

  const contractRate = parseFloat(form.contract_rate_etb) || 0;
  const totalEtb = totalUsd * contractRate;

  // Arrival inputs totals
  const arrivalTotals = useMemo(() => {
    let bags = 0, amount = 0;
    arrivalRows.forEach(r => {
      const b = parseFloat(r.bags) || 0;
      const p = parseFloat(r.price_etb) || 0;
      const fer = b * 85 / 17;
      bags += b;
      amount += fer * p;
    });
    return { bags, totalKg: bags * 85, totalPurchaseCost: amount };
  }, [arrivalRows]);

  // Auto-fill Purchase Cost into cost rows
  const handleArrivalChange = (rows) => {
    setArrivalRows(rows);
    const newAmount = rows.reduce((s, r) => {
      const b = parseFloat(r.bags) || 0;
      const p = parseFloat(r.price_etb) || 0;
      return s + (b * 85 / 17) * p;
    }, 0);
    setCostRows(prev => {
      const idx = prev.findIndex(r => r.name === 'Purchase Cost ETB');
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], amount_etb: newAmount > 0 ? String(newAmount) : '' };
      return updated;
    });
  };

  // Materials total (Feature 6)
  const totalMaterialsEtb = useMemo(
    () => materialRows.reduce((s, r) => s + ((parseFloat(r.quantity) || 0) * (parseFloat(r.unit_cost_etb) || 0)), 0),
    [materialRows]
  );

  // Cost rows + auto-injected "Export Materials" line item (read-only, only when > 0)
  const effectiveCostRows = useMemo(() => {
    const filtered = costRows.filter(r => r.name !== EXPORT_MATERIALS_COST_NAME);
    if (totalMaterialsEtb > 0) {
      return [...filtered, { name: EXPORT_MATERIALS_COST_NAME, amount_etb: String(totalMaterialsEtb), _auto: true }];
    }
    return filtered;
  }, [costRows, totalMaterialsEtb]);

  // Cost totals (uses effective rows so Export Materials is always included)
  const totalCosts = effectiveCostRows.reduce((s, r) => s + (parseFloat(r.amount_etb) || 0), 0);
  const rejectSales = parseFloat(form.reject_sales_etb) || 0;

  // Feature 1: Rate may be empty. Calculations show — placeholders when missing.
  const rateProvided = contractRate > 0;
  const exportSalesEtb = rateProvided ? totalEtb : null;
  const grandTotalSales = rateProvided ? (totalEtb + rejectSales) : null;
  const profitEtb = rateProvided ? (grandTotalSales - totalCosts) : null;
  const profitUsd = rateProvided ? profitEtb / contractRate : null;
  const profitMargin = rateProvided && grandTotalSales > 0 ? (profitEtb / grandTotalSales) * 100 : null;

  const coffeeType = form.coffee_type || '';
  const activePool = stockPool === 'Recleaned' ? availableStockRecleaned : availableStock;
  const availKg = activePool[coffeeType];
  const availForEdit = isEdit
    ? (availKg != null ? availKg + ((initialData.stock_pool || 'Fresh') === stockPool ? (initialData.export_kg || 0) : 0) : undefined)
    : availKg;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!coffeeType) { setKgError('Please select a coffee type.'); return; }
    if (pricingMethod === 'per_lb' && !(pricePerLb > 0)) { setKgError('Price per LB is required.'); return; }
    if (pricingMethod === 'per_kg' && !(pricePerKg > 0)) { setKgError('Price per KG is required.'); return; }
    const maxKg = isEdit ? availForEdit : availKg;
    if (maxKg != null && exportKg > maxKg) {
      setKgError(`Exceeds available stock. Maximum: ${fmt(maxKg, 0)} KG.`);
      return;
    }
    setKgError('');
    const remaining = maxKg != null ? maxKg - exportKg : null;
    setPendingData({ remaining });
    setConfirmOpen(true);
  };

  const confirmSave = () => {
    // Feature 1: track when rate was confirmed
    const previousRate = parseFloat(initialData?.contract_rate_etb) || 0;
    const rateStatus = rateProvided ? 'Rate Confirmed' : 'Rate Pending';
    const rateConfirmedDate = rateProvided
      ? (previousRate > 0 ? (initialData?.rate_confirmed_date || initialData?.contract_date || todayStr()) : todayStr())
      : null;

    const data = {
      ...form,
      stock_pool: stockPool,
      pricing_method: pricingMethod,
      // Feature 2: custom payment terms text
      custom_payment_terms: form.payment_terms === 'Other' ? (form.custom_payment_terms || null) : null,
      export_kg: exportKg || null,
      export_sample_kg: exportSampleKg || null,
      actual_shipped_kg: actualShippedKg || null,
      export_bags: exportBags || null,
      price_per_lb_usd: pricingMethod === 'per_lb' ? (pricePerLb || null) : null,
      price_per_kg_usd: pricingMethod === 'per_kg' ? (pricePerKg || null) : null,
      total_lb: pricingMethod === 'per_lb' ? (totalLb || null) : null,
      contract_rate_etb: rateProvided ? contractRate : null,
      rate_status: rateStatus,
      rate_confirmed_date: rateConfirmedDate,
      total_export_value_usd: totalUsd || null,
      total_export_value_etb: rateProvided ? totalEtb : null,
      arrival_inputs: JSON.stringify(arrivalRows),
      // Persist user-edited cost rows (without the auto Export Materials line)
      cost_rows: JSON.stringify(costRows.filter(r => r.name !== EXPORT_MATERIALS_COST_NAME)),
      // Feature 6: materials
      material_rows: JSON.stringify(materialRows.filter(r => r.name || r.quantity || r.unit_cost_etb)),
      total_materials_etb: totalMaterialsEtb || null,
      total_costs_etb: totalCosts || null,
      reject_sales_etb: rejectSales || null,
      grand_total_revenue_etb: grandTotalSales,
      profit_etb: profitEtb,
      profit_usd: profitUsd,
      profit_margin_pct: profitMargin,
      // legacy compat
      commodity: form.coffee_type,
      export_date: form.contract_date,
      usd_rate_etb: rateProvided ? contractRate : null,
      total_expenses_etb: totalCosts || null,
      export_total_sales_price_etb: rateProvided ? totalEtb : null,
      grand_total_sales_etb: grandTotalSales,
      total_profit_etb: profitEtb,
      total_reject_sales_etb: rejectSales || null,
    };
    setConfirmOpen(false);
    onSubmit(data);
  };

  const addArrivalRow = () => setArrivalRows(p => [...p, { bags: '', price_etb: '' }]);
  const removeArrivalRow = (i) => {
    const next = arrivalRows.filter((_, idx) => idx !== i);
    handleArrivalChange(next);
  };
  const updateArrivalRow = (i, v) => {
    const next = arrivalRows.map((r, idx) => idx === i ? v : r);
    handleArrivalChange(next);
  };

  const pricingHasValue = pricingMethod === 'per_lb' ? pricePerLb > 0 : pricePerKg > 0;

  const contractWarnings = useMemo(() => getExportContractWarnings(
    { ...form, pricing_method: pricingMethod, price_per_lb_usd: pricePerLb, price_per_kg_usd: pricePerKg, export_kg: exportKg, total_export_value_etb: totalEtb, total_costs_etb: totalCosts, profit_etb: profitEtb },
    availableStock
  ), [form, pricingMethod, pricePerLb, pricePerKg, exportKg, totalEtb, totalCosts, profitEtb, availableStock]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl w-full max-h-[95vh] overflow-y-auto p-0">
          <DialogHeader className="p-5 pb-4 sticky top-0 bg-background z-10 border-b border-border">
            <DialogTitle className="font-display text-lg">{isEdit ? 'Edit Contract' : 'New Export Contract'}</DialogTitle>
            {/* Step indicator */}
            <div className="flex items-center gap-0 mt-3">
              <button type="button" onClick={() => setStep(1)}
                className={`flex items-center gap-2 px-4 py-2 rounded-l-lg border text-xs font-semibold transition-all ${step === 1 ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:text-foreground'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 1 ? 'bg-white/30' : 'bg-border'}`}>1</span>
                Contract &amp; Pricing
              </button>
              <button type="button" onClick={() => setStep(2)}
                className={`flex items-center gap-2 px-4 py-2 rounded-r-lg border-t border-r border-b text-xs font-semibold transition-all ${step === 2 ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:text-foreground'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === 2 ? 'bg-white/30' : 'bg-border'}`}>2</span>
                Costs &amp; Profit
              </button>
            </div>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="p-5 space-y-8">

            {/* ══════════════ STEP 1: Contract & Pricing ══════════════ */}
            {step === 1 && <>

            {/* Stock Pool selector — choose which pool to draw from */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stock Source Pool *</p>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => { setStockPool('Fresh'); setKgError(''); }}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${stockPool === 'Fresh' ? 'bg-green-600 text-white border-green-600' : 'bg-background border-border text-muted-foreground hover:border-green-400'}`}>
                  Fresh Stock (Pool 1)
                </button>
                <button type="button"
                  onClick={() => { setStockPool('Recleaned'); setKgError(''); }}
                  className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${stockPool === 'Recleaned' ? 'bg-amber-600 text-white border-amber-600' : 'bg-background border-border text-muted-foreground hover:border-amber-400'}`}>
                  Recleaned Stock (Pool 2)
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">A contract cannot mix pools. Selected pool determines available KG.</p>

              {/* Available KG per coffee type for the SELECTED pool */}
              {Object.keys(activePool).length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  {Object.entries(activePool).map(([ct, kg]) => (
                    <div key={ct} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${kg > 0 ? (stockPool === 'Recleaned' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-green-50 border-green-200 text-green-800') : 'bg-red-50 border-red-200 text-red-700'}`}>
                      {ct}: <span className="font-bold">{fmt(kg, 0)} KG</span>
                    </div>
                  ))}
                </div>
              )}
              {Object.keys(activePool).length === 0 && (
                <p className="text-xs italic text-muted-foreground">No {stockPool === 'Recleaned' ? 'recleaned' : 'fresh'} stock available yet.</p>
              )}
            </div>

            {/* ── Contract Details ─────────────────────────────────────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">Contract Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Contract No *</Label>
                  <Input value={form.contract_no || ''} readOnly className="h-10 bg-muted font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Contract Date *</Label>
                  <Input type="date" value={form.contract_date || ''} onChange={e => set('contract_date', e.target.value)} required className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Contract PI Number</Label>
                  <Input value={form.contract_pi_number || ''} onChange={e => set('contract_pi_number', e.target.value)} placeholder="e.g. PI-2026-001" className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Coffee Type *</Label>
                  <select value={form.coffee_type || ''} onChange={e => { set('coffee_type', e.target.value); setKgError(''); }}
                    className="w-full h-10 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring" required>
                    <option value="">Choose coffee type</option>
                    {masterCoffeeTypes.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                  </select>
                  {coffeeType && availForEdit != null && (
                    <p className={`text-xs font-semibold mt-0.5 ${availForEdit > 0 ? 'text-green-700' : 'text-destructive'}`}>
                      {availForEdit > 0 ? `Available: ${fmt(availForEdit, 0)} KG` : 'No stock available for this coffee type.'}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Coffee Grade *</Label>
                  <Input value={form.coffee_grade || ''} onChange={e => set('coffee_grade', e.target.value)} placeholder="e.g. G1" required className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Destination Country *</Label>
                  <Input value={form.destination_country || ''} onChange={e => set('destination_country', e.target.value)} required className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Buyer Name *</Label>
                  <Input value={form.buyer_name || ''} onChange={e => set('buyer_name', e.target.value)} required className="h-10" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Payment Terms</Label>
                  <select value={form.payment_terms || ''} onChange={e => set('payment_terms', e.target.value)}
                    className="w-full h-10 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                    <option value="">Select...</option>
                    {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Expected Payment Date</Label>
                  <Input type="date" value={form.expected_payment_date || ''} onChange={e => set('expected_payment_date', e.target.value)} className="h-10" />
                </div>
                {/* Feature 2: custom payment terms when "Other" selected */}
                {form.payment_terms === 'Other' && (
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs font-medium">Specify payment terms *</Label>
                    <Input
                      value={form.custom_payment_terms || ''}
                      onChange={e => set('custom_payment_terms', e.target.value)}
                      placeholder="Type custom payment terms..."
                      className="h-10"
                    />
                  </div>
                )}
              </div>
            </section>

            {/* ── Export Quantity ──────────────────────────────────────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">Export Quantity</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs font-medium">Export KG *</Label>
                  <NumberInput decimals={2} value={form.export_kg || ''} onChange={v => { set('export_kg', v); setKgError(''); }} required className="h-10" placeholder="0.00" />
                  {exportKg > 0 && <p className="text-xs text-muted-foreground">Export Bags: <span className="font-semibold text-foreground">{exportBags.toLocaleString()}</span> (÷60)</p>}
                  {kgError && <p className="text-xs text-destructive font-medium">{kgError}</p>}
                </div>
              </div>
            </section>

            {/* ── Pricing Method ───────────────────────────────────────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">Pricing</h3>

              {/* Toggle */}
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => setPricingMethod('per_lb')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${pricingMethod === 'per_lb' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}>
                  Per LB (USD)
                </button>
                <button type="button"
                  onClick={() => setPricingMethod('per_kg')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${pricingMethod === 'per_kg' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground hover:border-primary/50'}`}>
                  Per KG (USD)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Feature 1: Exchange Rate — OPTIONAL. Two-stage flow. */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium flex items-center gap-2">
                    USD/ETB Exchange Rate
                    {!rateProvided && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">Rate Pending</span>
                    )}
                    {rateProvided && (
                      <span className="text-[10px] font-bold text-green-700 bg-green-100 border border-green-200 px-1.5 py-0.5 rounded-full">Rate Confirmed</span>
                    )}
                  </Label>
                  <NumberInput
                    decimals={4}
                    value={form.contract_rate_etb || ''}
                    onChange={v => set('contract_rate_etb', v)}
                    className="h-10"
                    placeholder="Leave empty if rate not yet known"
                  />
                  {!rateProvided
                    ? <p className="text-xs text-amber-700">Rate optional — contract can be saved and rate added later via "Add Rate".</p>
                    : (isEdit && initialData?.rate_confirmed_date && <p className="text-xs text-green-700">Rate confirmed on {initialData.rate_confirmed_date}</p>)
                  }
                </div>

                {pricingMethod === 'per_lb' ? (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Price per LB (USD) *</Label>
                      <NumberInput decimals={6} value={form.price_per_lb_usd != null && form.price_per_lb_usd !== '' ? form.price_per_lb_usd : ''} onChange={v => set('price_per_lb_usd', v)} required className="h-10" placeholder="0.000000" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Conversion Rate (fixed)</Label>
                      <div className="px-3 py-2 h-10 rounded-md border border-input bg-muted text-sm font-medium flex items-center">{LB_CONVERSION} lb/kg</div>
                    </div>
                    <RO label="Total LB (auto)" value={`${fmt(totalLb, 3)} LB`} />
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Price per KG (USD) *</Label>
                      <NumberInput decimals={4} value={form.price_per_kg_usd != null && form.price_per_kg_usd !== '' ? form.price_per_kg_usd : ''} onChange={v => set('price_per_kg_usd', v)} required className="h-10" placeholder="0.0000" />
                    </div>
                    <RO label="Total LB (ref)" value={`${fmt(totalLb, 3)} LB`} />
                  </>
                )}
              </div>

              {/* Pricing summary — show — placeholders when rate missing */}
              {actualShippedKg > 0 && pricingHasValue && (
                <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                  <RO label="Total USD (auto)" value={`$${fmt(totalUsd, 3)}`} />
                  <RO label="Export Sales ETB (auto)" value={rateProvided ? fmt(totalEtb) : '—'} green={rateProvided} />
                </div>
              )}
            </section>

            {/* ── Arrival Inputs ───────────────────────────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-1">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Arrival Inputs</h3>
                <Button type="button" variant="outline" size="sm" onClick={addArrivalRow}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Row
                </Button>
              </div>
              {arrivalRows.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-2">No arrival inputs yet. Click "+ Add Row" to add supplier bags.</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {arrivalRows.map((r, i) => (
                      <ArrivalRow key={i} row={r}
                        onChange={v => updateArrivalRow(i, v)}
                        onRemove={() => removeArrivalRow(i)} />
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-muted/40 border border-border">
                    <RO label="Total Bags" value={fmt(arrivalTotals.bags, 0)} />
                    <RO label="Total KG (Bags × 85)" value={`${fmt(arrivalTotals.totalKg, 0)} KG`} />
                    <RO label="Total Purchase Cost ETB" value={fmt(arrivalTotals.totalPurchaseCost, 0)} green />
                  </div>
                </>
              )}
            </section>

            </> /* end step 1 */}

            {/* ══════════════ STEP 2: Costs & Profit ══════════════ */}
            {step === 2 && <>

            {/* ── Cost Breakdown ───────────────────────────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-1">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Cost Breakdown</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setCostRows(p => [...p, { name: '', amount_etb: '' }])}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Cost
                </Button>
              </div>
              <div className="flex gap-2 mb-1">
                <span className="flex-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Cost Name</span>
                <span className="w-44 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Amount ETB</span>
                <span className="w-9" />
              </div>
              <div className="space-y-1.5">
                {effectiveCostRows.map((row, i) => (
                  <CostRow
                    key={i}
                    row={row}
                    readOnlyAmount={row._auto}
                    onChange={v => {
                      if (row._auto) return; // auto rows aren't editable
                      // map back to costRows index by name (these come from costRows in order)
                      setCostRows(p => p.map((r, idx) => idx === i ? v : r));
                    }}
                    onRemove={() => {
                      if (row._auto) return;
                      setCostRows(p => p.filter((_, idx) => idx !== i));
                    }}
                  />
                ))}
              </div>
              <div className="flex justify-end pt-2 border-t border-border">
                <span className="text-sm font-bold">Total Expenses ETB: <span className="text-foreground">{fmt(totalCosts)}</span></span>
              </div>
            </section>

            {/* ── Profit Calculation ───────────────────────────────────── */}
            <section className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">Revenue & Profit</h3>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Total Reject Sales ETB (optional)</Label>
                <NumberInput decimals={2} value={form.reject_sales_etb || ''} onChange={v => set('reject_sales_etb', v)} placeholder="0.00" className="h-10" />
              </div>

              <div className="rounded-xl border-2 border-primary/20 bg-card p-5 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <RO label="Export Sales ETB" value={rateProvided ? fmt(exportSalesEtb) : '—'} green={rateProvided} />
                  <RO label="Reject Sales ETB" value={fmt(rejectSales)} />
                  <RO label="Grand Total Sales ETB" value={rateProvided ? fmt(grandTotalSales) : '—'} green={rateProvided} />
                  <RO label="Total Expenses ETB" value={fmt(totalCosts)} />
                  <RO label="Profit USD" value={rateProvided ? `$${fmt(profitUsd)}` : '—'} green={rateProvided && profitUsd >= 0} red={rateProvided && profitUsd < 0} />
                  <RO label="Profit Margin %" value={rateProvided ? `${fmt(profitMargin, 1)}%` : '—'} green={rateProvided && profitMargin >= 5} red={rateProvided && profitMargin < 0} />
                </div>
                {/* Big profit figure */}
                <div className={`rounded-xl p-4 border-2 ${!rateProvided ? 'border-amber-200 bg-amber-50/60' : profitEtb >= 0 ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Total Profit ETB</p>
                  {rateProvided ? (
                    <p className={`text-3xl font-bold ${profitEtb >= 0 ? 'text-green-700' : 'text-destructive'}`}>{fmt(profitEtb)}</p>
                  ) : (
                    <div>
                      <p className="text-3xl font-bold text-muted-foreground">—</p>
                      <p className="text-xs text-amber-700 mt-1">Profit will calculate once Exchange Rate is added.</p>
                    </div>
                  )}
                </div>
                {rateProvided && profitEtb < 0 && (
                  <p className="text-sm font-semibold text-destructive">🔴 This contract will make a loss</p>
                )}
                {rateProvided && profitEtb >= 0 && profitMargin < 5 && grandTotalSales > 0 && (
                  <p className="text-sm font-semibold text-amber-600">⚠️ Low profit margin — review costs</p>
                )}
              </div>
            </section>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Remark</Label>
              <Textarea value={form.remark || ''} onChange={e => set('remark', e.target.value)} rows={2} placeholder="Optional..." />
            </div>

            {contractWarnings.length > 0 && (
              <div className="pt-2">
                <InlineWarningList warnings={contractWarnings} />
              </div>
            )}

            </> /* end step 2 */}

            <div className="sticky bottom-0 bg-background pt-3 border-t border-border -mx-5 px-5 pb-1 flex gap-3 justify-end">
              <Button type="button" variant="outline" className="h-11 px-6" onClick={() => onOpenChange(false)}>Cancel</Button>
              {step === 1 ? (
                <Button type="button" className="h-11 px-8 gap-2" onClick={() => setStep(2)}>
                  Next — Costs &amp; Profit <span className="text-base">→</span>
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" className="h-11 px-6 gap-2" onClick={() => setStep(1)}>
                    <span className="text-base">←</span> Back
                  </Button>
                  <Button type="submit" disabled={isSubmitting} className="h-11 px-8">
                    {isSubmitting ? 'Saving...' : isEdit ? 'Update Contract' : 'Save Contract'}
                  </Button>
                </>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Export Contract</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">Export <strong>{fmt(exportKg, 0)} KG</strong> of <strong>{form.coffee_type}</strong> to <strong>{form.destination_country}</strong>.</span>
              {actualShippedKg !== exportKg && (
                <span className="block text-green-700">Actual Shipped: <strong>{fmt(actualShippedKg, 0)} KG</strong> (after {fmt(exportSampleKg, 0)} KG sample)</span>
              )}
              {pendingData?.remaining != null && (
                <span className={`block font-semibold ${pendingData.remaining > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                  Available stock will reduce to <strong>{fmt(pendingData.remaining, 0)} KG</strong>.
                </span>
              )}
              {isEdit && originalDestination && form.destination_country !== originalDestination && (
                <span className="block mt-2 p-2 rounded bg-amber-50 border border-amber-300 text-amber-800 font-semibold">
                  ⚠️ Destination is being changed from <strong>{originalDestination}</strong> → <strong>{form.destination_country}</strong>. Make sure this is correct before confirming.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSave}>Confirm & Save</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}