import { z } from 'zod';

const num = z.coerce.number({ invalid_type_error: 'Must be a number' });
const isoDate = z.string().min(1, 'Required').refine(
  v => !Number.isNaN(Date.parse(v)),
  { message: 'Invalid date' },
);

export const warehouseReceiptSchema = z.object({
  coffee_code: z.string().trim().min(1, 'Coffee code is required'),
  supplier_name: z.string().trim().max(120).optional().or(z.literal('')),
  warehouse_received_net_kg: num.positive('Received KG must be > 0'),
  net_dispatch_weight_kg: num.nonnegative().optional(),
  bags_received: z.coerce.number().int('Must be whole number').nonnegative().optional(),
  grn_code: z.string().trim().max(64).optional().or(z.literal('')),
  dispatch_no: z.string().trim().max(64).optional().or(z.literal('')),
  received_date: isoDate,
});
