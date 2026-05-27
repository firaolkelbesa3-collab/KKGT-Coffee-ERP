import { z } from 'zod';

const num = z.coerce.number({ invalid_type_error: 'Must be a number' });
const isoDate = z.string().min(1, 'Required').refine(
  v => !Number.isNaN(Date.parse(v)),
  { message: 'Invalid date' },
);

export const buyerInspectionSchema = z.object({
  inspection_date: isoDate,
  buyer_name: z.string().trim().min(1, 'Buyer is required').max(120),
  coffee_type: z.string().trim().max(80).optional().or(z.literal('')),
  kg_to_inspect: num.positive('KG to inspect must be > 0'),
  sample_kg_taken: num.nonnegative().optional().default(0),
  result: z.enum(['Pending', 'Passed', 'Failed']).default('Pending'),
  kg_approved: num.nonnegative().optional(),
  kg_rejected: num.nonnegative().optional(),
  rejection_reason: z.enum([
    'Too Much Moisture', 'Grade Too Low', 'Defects', 'Smell/Taste Issue', 'Other',
  ]).optional(),
  action_taken: z.enum(['Reprocess', 'Sell Locally', 'Hold in Warehouse']).optional(),
}).refine(
  d => d.result !== 'Passed' || (d.kg_approved ?? 0) > 0,
  { path: ['kg_approved'], message: 'kg_approved required when result is Passed' },
).refine(
  d => d.result !== 'Failed' || !!d.rejection_reason,
  { path: ['rejection_reason'], message: 'rejection_reason required when result is Failed' },
);
