import { z } from 'zod';

const num = z.coerce.number({ invalid_type_error: 'Must be a number' });
const isoDate = z.string().min(1, 'Required').refine(
  v => !Number.isNaN(Date.parse(v)),
  { message: 'Invalid date' },
);

export const processingLogSchema = z.object({
  entry_type: z.enum(['Standard', 'Recleaning']),
  entry_mode: z.enum(['By Bags', 'By KG']).optional(),
  date: isoDate,
  supplier_name: z.string().trim().max(120).optional().or(z.literal('')),
  coffee_type: z.string().trim().max(80).optional().or(z.literal('')),
  coffee_code: z.string().trim().max(64).optional().or(z.literal('')),
  batch_no: z.string().trim().max(64).optional().or(z.literal('')),
  bags_sent: num.nonnegative().optional(),
  kg_sent: num.nonnegative().optional(),
  actual_weighed_kg: num.nonnegative().optional(),
  buyer_name: z.string().trim().max(120).optional().or(z.literal('')),
  inspection_ref: z.string().trim().max(64).optional().or(z.literal('')),
}).refine(
  d => (d.bags_sent ?? 0) > 0 || (d.kg_sent ?? 0) > 0,
  { path: ['kg_sent'], message: 'Either bags or KG must be > 0' },
);
