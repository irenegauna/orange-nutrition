import { z } from 'zod';

/**
 * Lenient schema for the Open Food Facts v2 product endpoint. OFF data is crowd-sourced:
 * numbers may arrive as strings, fields may be missing. We validate shape, then normalize.
 */
const numeric = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'not a number' });
    return z.NEVER;
  }
  return n;
});

export const offNutrimentsSchema = z.record(z.string(), z.unknown());

export const offProductSchema = z
  .object({
    code: z.string().optional(),
    product_name_es: z.string().optional().nullable(),
    generic_name_es: z.string().optional().nullable(),
    product_name: z.string().optional().nullable(),
    product_name_en: z.string().optional().nullable(),
    generic_name: z.string().optional().nullable(),
    brands: z.string().optional().nullable(),
    quantity: z.string().optional().nullable(),
    serving_size: z.string().optional().nullable(),
    serving_quantity: numeric.optional().nullable().catch(undefined),
    nutrition_data_per: z.string().optional().nullable(),
    nutriments: offNutrimentsSchema.optional().nullable(),
    allergens_tags: z.array(z.string()).optional().nullable(),
    traces_tags: z.array(z.string()).optional().nullable(),
    ingredients_analysis_tags: z.array(z.string()).optional().nullable(),
    categories_tags: z.array(z.string()).optional().nullable(),
    image_front_small_url: z.string().optional().nullable(),
  })
  .passthrough();

export const offResponseSchema = z
  .object({
    status: z.union([z.number(), z.string()]).optional(),
    status_verbose: z.string().optional(),
    code: z.string().optional(),
    product: offProductSchema.optional().nullable(),
  })
  .passthrough();

export type OffProduct = z.infer<typeof offProductSchema>;
export type OffResponse = z.infer<typeof offResponseSchema>;

/** Safely reads a numeric nutriment; returns undefined if absent or not a finite number. */
export function readNumber(rec: Record<string, unknown> | null | undefined, key: string): number | undefined {
  if (!rec) return undefined;
  const v = rec[key];
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
