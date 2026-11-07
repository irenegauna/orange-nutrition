import { z } from 'zod';
import { NUTRIENT_IDS, type NutrientValue, type NutrientValues } from '../types/nutrients';
import {
  BACKUP_FORMAT,
  MEAL_TYPES,
  type BackupPayload,
  type CachedProduct,
  type DailyGoals,
  type Food,
  type MealEntry,
  type Recipe,
  type UserPreferences,
} from '../types/domain';
import { isValidLocalDate } from '../utils/dates';

/** Zod schemas mirroring the exported interfaces. Used at every trust boundary. */

const finiteNonNeg = z.number().finite().nonnegative();
export const localDateSchema = z.string().refine(isValidLocalDate, 'Expected a valid YYYY-MM-DD local date');
export const isoTimestampSchema = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Expected an ISO timestamp');
export const nutrientIdSchema = z.enum(NUTRIENT_IDS);

export const nutrientValueSchema: z.ZodType<NutrientValue> = z.discriminatedUnion('status', [
  z.object({ status: z.literal('known'), amount: finiteNonNeg, isLowerBound: z.boolean().optional() }),
  z.object({ status: z.literal('zero'), amount: z.literal(0) }),
  z.object({ status: z.literal('estimated'), amount: finiteNonNeg, isLowerBound: z.boolean().optional() }),
  z.object({ status: z.literal('missing'), amount: z.null() }),
]);

export const nutrientValuesSchema: z.ZodType<NutrientValues> = z
  .record(z.string(), nutrientValueSchema)
  .superRefine((rec, ctx) => {
    for (const k of Object.keys(rec)) {
      if (!(NUTRIENT_IDS as readonly string[]).includes(k)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown nutrient id "${k}"`, path: [k] });
    }
  }) as unknown as z.ZodType<NutrientValues>;

const completenessSchema = z.object({
  totalTracked: z.number().int(),
  known: z.number().int(),
  zero: z.number().int(),
  estimated: z.number().int(),
  missing: z.number().int(),
  score: z.number().min(0).max(1),
  hasCoreMacros: z.boolean(),
  missingNutrients: z.array(nutrientIdSchema),
});

export const allergenSchema = z.enum(['milk', 'egg', 'fish', 'shellfish', 'molluscs', 'tree_nuts', 'peanuts', 'wheat', 'gluten', 'soy', 'sesame', 'mustard', 'celery', 'lupin', 'sulphites']);
export const dietaryFlagSchema = z.enum(['meat', 'poultry', 'fish', 'shellfish', 'dairy', 'egg', 'honey', 'gluten', 'alcohol']);
export const dietTypeSchema = z.enum(['vegan', 'vegetarian', 'pescatarian', 'gluten_free', 'dairy_free']);
export const mealTypeSchema = z.enum(MEAL_TYPES);
export const quantityUnitSchema = z.enum(['g', 'kg', 'mg', 'oz', 'lb', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'fl_oz', 'serving']);

export const servingSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  grams: z.number().finite().positive(),
  volumeMl: z.number().finite().positive().optional(),
  isDefault: z.boolean().optional(),
});

export const quantitySchema = z.object({ amount: z.number().finite().positive(), unit: quantityUnitSchema, servingId: z.string().optional() });

export const dataSourceSchema = z.object({
  type: z.enum(['usda_sr_legacy', 'open_food_facts', 'user', 'recipe']),
  sourceId: z.string().optional(),
  originalName: z.string().optional(),
  attribution: z.string(),
  license: z.string(),
  url: z.string().optional(),
  retrievedAt: isoTimestampSchema.optional(),
});

export const foodSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  brand: z.string().max(200).optional(),
  barcode: z.string().regex(/^\d{6,14}$/).optional(),
  category: z.enum(['fruits', 'vegetables', 'meat', 'poultry', 'fish', 'seafood', 'eggs', 'dairy', 'grains', 'legumes', 'nuts_seeds', 'oils_fats', 'sweeteners', 'condiments', 'spices', 'beverages', 'sweets', 'prepared', 'other']),
  role: z.enum(['protein', 'carb', 'vegetable', 'fruit', 'fat', 'dairy', 'snack', 'condiment', 'beverage', 'other']),
  form: z.enum(['ready', 'cooked', 'raw', 'dry']),
  source: dataSourceSchema,
  nutrientsPer100g: nutrientValuesSchema,
  completeness: completenessSchema,
  servings: z.array(servingSchema),
  densityGPerMl: z.number().finite().positive().optional(),
  allergens: z.array(allergenSchema),
  traces: z.array(allergenSchema),
  dietaryFlags: z.array(dietaryFlagSchema),
  allergenInfo: z.enum(['curated', 'declared', 'user', 'unknown']),
  prepTimeMinutes: finiteNonNeg.optional(),
  aliases: z.array(z.string()),
  imageUrl: z.string().optional(),
  isArchived: z.boolean(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}) satisfies z.ZodType<Food, z.ZodTypeDef, unknown>;

export const foodSnapshotSchema = z.object({
  name: z.string(),
  brand: z.string().optional(),
  sourceType: dataSourceSchema.shape.type,
  nutrientsPer100g: nutrientValuesSchema,
  servings: z.array(servingSchema),
  densityGPerMl: z.number().finite().positive().optional(),
});

export const mealEntrySchema = z
  .object({
    id: z.string().min(1),
    date: localDateSchema,
    mealType: mealTypeSchema,
    kind: z.enum(['food', 'recipe']),
    foodId: z.string().optional(),
    recipeId: z.string().optional(),
    snapshot: foodSnapshotSchema,
    quantity: quantitySchema,
    grams: finiteNonNeg,
    nutrients: nutrientValuesSchema,
    note: z.string().max(1000).optional(),
    origin: z.enum(['manual', 'barcode', 'photo_ai', 'recipe', 'copy', 'suggestion']).optional(),
    photoId: z.string().optional(),
    loggedAt: isoTimestampSchema,
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .refine((e) => (e.kind === 'food' ? !!e.foodId : !!e.recipeId), 'foodId required for food entries, recipeId for recipe entries') satisfies z.ZodType<MealEntry, z.ZodTypeDef, unknown>;

export const recipeIngredientSchema = z.object({
  id: z.string().min(1),
  foodId: z.string().min(1),
  quantity: quantitySchema,
  grams: finiteNonNeg,
  snapshot: foodSnapshotSchema,
  note: z.string().optional(),
});

export const recipeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  servings: z.number().finite().positive(),
  ingredients: z.array(recipeIngredientSchema),
  cookedWeightGrams: z.number().finite().positive().optional(),
  prepTimeMinutes: finiteNonNeg.optional(),
  cookTimeMinutes: finiteNonNeg.optional(),
  mealTypes: z.array(mealTypeSchema),
  instructions: z.array(z.string()),
  tags: z.array(z.string()),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}) satisfies z.ZodType<Recipe, z.ZodTypeDef, unknown>;

export const nutrientTargetSchema = z.object({
  amount: z.number().finite().positive(),
  direction: z.enum(['atLeast', 'atMost', 'around']),
  tolerance: z.number().min(0).max(1).optional(),
  origin: z.enum(['user', 'reference']),
});

export const dailyGoalsSchema = z.object({
  id: z.string().min(1),
  effectiveFrom: localDateSchema,
  targets: z.record(nutrientIdSchema, nutrientTargetSchema),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}) satisfies z.ZodType<DailyGoals, z.ZodTypeDef, unknown>;

export const userPreferencesSchema = z.object({
  id: z.literal('user'),
  diets: z.array(dietTypeSchema),
  allergies: z.array(allergenSchema),
  dislikedFoodIds: z.array(z.string()),
  dislikedKeywords: z.array(z.string()),
  favoriteFoodIds: z.array(z.string()),
  favoriteRecipeIds: z.array(z.string()),
  availableIngredientIds: z.array(z.string()),
  maxPrepTimeMinutes: finiteNonNeg.optional(),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  unitSystem: z.enum(['metric', 'imperial']),
  updatedAt: isoTimestampSchema,
}) satisfies z.ZodType<UserPreferences, z.ZodTypeDef, unknown>;

export const cachedProductSchema = z.object({
  barcode: z.string().regex(/^\d{6,14}$/),
  status: z.enum(['found', 'not_found']),
  food: foodSchema.optional(),
  fetchedAt: isoTimestampSchema,
  expiresAt: isoTimestampSchema,
}) satisfies z.ZodType<CachedProduct, z.ZodTypeDef, unknown>;

export const backupPayloadSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.number().int().positive(),
  exportedAt: isoTimestampSchema,
  appVersion: z.string(),
  dbVersion: z.number().int().positive(),
  data: z.object({
    foods: z.array(foodSchema),
    mealEntries: z.array(mealEntrySchema),
    recipes: z.array(recipeSchema),
    goals: z.array(dailyGoalsSchema),
    preferences: z.array(userPreferencesSchema).max(1),
    cachedProducts: z.array(cachedProductSchema).optional(),
  }),
  counts: z.record(z.string(), z.number().int().nonnegative()),
  checksum: z.string(),
}) satisfies z.ZodType<BackupPayload, z.ZodTypeDef, unknown>;

/** Formats Zod issues into readable strings ("data.foods.3.name: Required"). */
export function formatZodIssues(error: z.ZodError, max = 20): string[] {
  return error.issues.slice(0, max).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

export const aiSettingsSchema = z.object({
  provider: z.literal('gemini'),
  apiKey: z.string().trim().min(10).max(200).nullable(),
  model: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9._-]+$/, 'Invalid model id'),
  photoRecognitionEnabled: z.boolean(),
  aiSuggestionsEnabled: z.boolean(),
  consentAcceptedAt: isoTimestampSchema.nullable(),
});

// ── Personal profile ─────────────────────────────────────────────────────
export const userProfileInputSchema = z.object({
  sex: z.enum(['female', 'male']),
  age: z.number().int('Age must be a whole number').min(18, 'Targets are for adults (18+)').max(110, 'Check the age'),
  heightCm: z.number().min(120, 'Height looks too low (cm)').max(230, 'Height looks too high (cm)'),
  weightKg: z.number().min(30, 'Weight looks too low (kg)').max(300, 'Weight looks too high (kg)'),
  activity: z.enum(['sedentary', 'moderate', 'active', 'very_active']),
  objective: z.enum(['lose', 'maintain', 'gain']),
});

export const userProfileSchema = z.object({
  sex: z.enum(['female', 'male']),
  birthYear: z.number().int().min(1900).max(2100),
  heightCm: z.number().min(120).max(230),
  weightKg: z.number().min(30).max(300),
  activity: z.enum(['sedentary', 'moderate', 'active', 'very_active']),
  objective: z.enum(['lose', 'maintain', 'gain']),
  updatedAt: z.string(),
});
