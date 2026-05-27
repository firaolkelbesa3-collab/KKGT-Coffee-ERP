import { z } from 'zod';

const num = z.coerce.number({ invalid_type_error: 'Must be a number' });
const isoDate = z.string().min(1, 'Required').refine(
  v => !Number.isNaN(Date.parse(v)),
  { message: 'Invalid date' },
);

export const exportContractSchema = z.object({
  contract_no: z.string().trim().min(1, 'Contract number is required').max(64),
  contract_date: isoDate,
  buyer_name: z.string().trim().min(1, 'Buyer is required').max(120),
  destination_country: z.string().trim().max(80).optional().or(z.literal('')),
  coffee_type: z.string().trim().max(80).optional().or(z.literal('')),
  coffee_grade: z.string().trim().max(40).optional().or(z.literal('')),
  stock_pool: z.enum(['Fresh', 'Recleaned']).optional(),
  payment_terms: z.enum(['LC', 'CAD', 'Advance', 'Open Account', 'Other']).optional(),
  export_kg: num.positive('Export KG must be > 0'),
  export_bags: z.coerce.number().int().nonnegative().optional(),
  price_per_kg_usd: num.positive('Price/KG must be > 0'),
  contract_rate_etb: num.positive('ETB rate must be > 0').optional(),
});
