import { z } from 'zod';

const num = z.coerce.number({ invalid_type_error: 'Must be a number' });
const isoDate = z.string().min(1, 'Required').refine(
  v => !Number.isNaN(Date.parse(v)),
  { message: 'Invalid date' },
);

export const outputReportSchema = z.object({
  entry_type: z.enum(['Standard', 'Recleaned']),
  start_date: isoDate,
  end_date: isoDate,
  supplier_name: z.string().trim().max(120).optional().or(z.literal('')),
  coffee_type: z.string().trim().max(80).optional().or(z.literal('')),
  total_kg_processed: num.positive('Total KG must be > 0'),
  export_bags: z.coerce.number().int().nonnegative(),
  reject_bags: z.coerce.number().int().nonnegative(),
  waste_kg: num.nonnegative().optional().default(0),
  additional_pool1_kg: num.nonnegative().optional().default(0),
  registrar_name: z.string().trim().min(1, 'Registrar is required').max(120),
  remark: z.string().trim().max(500).optional().or(z.literal('')),
}).refine(
  d => Date.parse(d.start_date) <= Date.parse(d.end_date),
  { path: ['end_date'], message: 'End date must be on or after start date' },
);
