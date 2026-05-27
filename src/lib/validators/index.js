import { toast } from '@/components/ui/use-toast';

/**
 * Run a zod schema against form data. On failure, fires a destructive toast
 * listing field errors and returns null. On success returns parsed data.
 *
 *   const data = validateOrToast(purchaseSchema, formState);
 *   if (!data) return; // toast already shown
 *
 * Throwing is deliberately avoided: it keeps form-handler code linear and
 * makes the validation step a no-op in tests that mock toast.
 */
export function validateOrToast(schema, value, { title = 'Please fix the following' } = {}) {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const lines = result.error.issues.slice(0, 6).map(i => {
    const path = i.path.length ? `${i.path.join('.')}: ` : '';
    return `${path}${i.message}`;
  });
  const extra = result.error.issues.length > 6 ? ` (+${result.error.issues.length - 6} more)` : '';

  toast({
    title,
    description: lines.join(' • ') + extra,
    variant: 'destructive',
  });

  return null;
}

// Re-export entity schemas so callers can `import { purchaseSchema } from '@/lib/validators'`.
export { purchaseSchema } from './purchase';
export { warehouseReceiptSchema } from './warehouseReceipt';
export { exportContractSchema } from './exportContract';
export { outputReportSchema } from './outputReport';
export { processingLogSchema } from './processingLog';
export { buyerInspectionSchema } from './buyerInspection';
