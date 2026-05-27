import { z } from 'zod';

// Coerce common form values (strings from <Input>) into typed primitives before validation.
const num = z.coerce.number({ invalid_type_error: 'Must be a number' });
const positiveKg = num.nonnegative('Cannot be negative');
const isoDate = z.string().min(1, 'Required').refine(
  v => !Number.isNaN(Date.parse(v)),
  { message: 'Invalid date' },
);

export const purchaseSchema = z.object({
  coffee_code: z.string().trim().min(1, 'Coffee code is required').max(64),
  purchase_date: isoDate,
  supplier_name: z.string().trim().min(1, 'Supplier is required').max(120),
  agent: z.string().trim().max(120).optional().or(z.literal('')),
  region: z.string().trim().max(40).optional().or(z.literal('')),
  coffee_type: z.string().trim().max(80).optional().or(z.literal('')),
  net_dispatch_weight_kg: positiveKg,
  unit_price_etb_per_feresula: num.positive('Unit price must be positive'),
  commission_percent: num.min(0, 'Cannot be negative').max(20, 'Commission seems too high (>20%)'),
  additional_costs: z.array(
    z.object({
      name: z.string().trim().min(1, 'Cost name required'),
      amount: num.nonnegative('Cost cannot be negative'),
    }),
  ).optional().default([]),
  payment_history: z.array(z.any()).optional().default([]),
});
