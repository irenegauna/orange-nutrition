import type { NutrientCompleteness, NutrientId, NutrientTotals, NutrientValues } from './nutrients';

/**
 * A calendar date in the user's local timezone, formatted `YYYY-MM-DD`.
 * Always build with `toLocalDate()`; never with `Date#toISOString()` (UTC shift bug).
 */
export type LocalDate = string;

/** ISO-8601 timestamp (UTC), e.g. `2026-11-07T18:30:00.000Z`. Used only for audit fields / ordering. */
export type IsoTimestamp = string;

// ---------------------------------------------------------------------------
// Food
// ---------------------------------------------------------------------------

export type FoodSourceType = 'usda_sr_legacy' | 'open_food_facts' | 'user' | 'recipe';

/** Provenance and licensing of a food's data. Always preserved for attribution. */
export interface DataSource {
  type: FoodSourceType;
  /** Id in the source dataset (USDA FDC id, OFF barcode...). */
  sourceId?: string;
  /** Original name in the source dataset. */
  originalName?: string;
  /** Human-readable attribution, e.g. "U.S. Department of Agriculture, FoodData Central (SR Legacy)". */
  attribution: string;
  license: string;
  url?: string;
  /** When the data was retrieved/imported. */
  retrievedAt?: IsoTimestamp;
}

export type FoodCategory =
  | 'fruits'
  | 'vegetables'
  | 'meat'
  | 'poultry'
  | 'fish'
  | 'seafood'
  | 'eggs'
  | 'dairy'
  | 'grains'
  | 'legumes'
  | 'nuts_seeds'
  | 'oils_fats'
  | 'sweeteners'
  | 'condiments'
  | 'spices'
  | 'beverages'
  | 'sweets'
  | 'prepared'
  | 'other';

/** Culinary role used by the recommendation engine to compose plates. */
export type FoodRole =
  | 'protein'
  | 'carb'
  | 'vegetable'
  | 'fruit'
  | 'fat'
  | 'dairy'
  | 'snack'
  | 'condiment'
  | 'beverage'
  | 'other';

/** Preparation state the nutrient values refer to. */
export type FoodForm = 'ready' | 'cooked' | 'raw' | 'dry';

export type Allergen =
  | 'milk'
  | 'egg'
  | 'fish'
  | 'shellfish'
  | 'molluscs'
  | 'tree_nuts'
  | 'peanuts'
  | 'wheat'
  | 'gluten'
  | 'soy'
  | 'sesame'
  | 'mustard'
  | 'celery'
  | 'lupin'
  | 'sulphites';

/** Animal products / components a food contains, used to evaluate diets. */
export type DietaryFlag = 'meat' | 'poultry' | 'fish' | 'shellfish' | 'dairy' | 'egg' | 'honey' | 'gluten' | 'alcohol';

/**
 * Reliability of allergen/dietary metadata.
 * - `curated`: reviewed classification (seed foods)
 * - `declared`: declared by the manufacturer (Open Food Facts tags)
 * - `user`: entered by the user
 * - `unknown`: no information → treated as unsafe when the user has allergies/diets
 */
export type MetadataReliability = 'curated' | 'declared' | 'user' | 'unknown';

/** A named portion with its gram weight, e.g. "1 cup, chopped" = 91 g. */
export interface ServingDefinition {
  id: string;
  label: string;
  grams: number;
  /** Optional volume equivalence in ml (lets volume units resolve to grams). */
  volumeMl?: number;
  isDefault?: boolean;
}

/** A food with nutrition per 100 g. */
export interface Food {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  category: FoodCategory;
  role: FoodRole;
  form: FoodForm;
  source: DataSource;
  /** Nutrient values per 100 g of edible portion. Absent key = missing. */
  nutrientsPer100g: NutrientValues;
  /** Derived summary of `nutrientsPer100g` (kept in sync by the repositories). */
  completeness: NutrientCompleteness;
  servings: ServingDefinition[];
  /** g/ml, allows volume quantities (ml, cup...) without a matching serving. */
  densityGPerMl?: number;
  allergens: Allergen[];
  /** Allergens the product "may contain" (traces). Treated as allergens for exclusion. */
  traces: Allergen[];
  dietaryFlags: DietaryFlag[];
  allergenInfo: MetadataReliability;
  /** Typical preparation time in minutes (estimate). */
  prepTimeMinutes?: number;
  aliases: string[];
  imageUrl?: string;
  /** Archived foods stay resolvable for history but are hidden from search. */
  isArchived: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Quantities
// ---------------------------------------------------------------------------

export type MassUnit = 'g' | 'kg' | 'mg' | 'oz' | 'lb';
export type VolumeUnit = 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'fl_oz';
export type QuantityUnit = MassUnit | VolumeUnit | 'serving';

/** A user-entered quantity. `servingId` is required when unit = 'serving'. */
export interface Quantity {
  amount: number;
  unit: QuantityUnit;
  servingId?: string;
}

// ---------------------------------------------------------------------------
// Meal log
// ---------------------------------------------------------------------------

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

/** Frozen copy of the food at log time so history stays stable when foods are edited/deleted. */
export interface FoodSnapshot {
  name: string;
  brand?: string;
  sourceType: FoodSourceType;
  /** Nutrient values per 100 g at log time. */
  nutrientsPer100g: NutrientValues;
  servings: ServingDefinition[];
  densityGPerMl?: number;
}

/** How an entry was created (for UI badges / analytics). */
export type EntryOrigin = 'manual' | 'barcode' | 'photo_ai' | 'recipe' | 'copy' | 'suggestion';

export interface MealEntry {
  id: string;
  date: LocalDate;
  mealType: MealType;
  kind: 'food' | 'recipe';
  /** Set when kind = 'food'. */
  foodId?: string;
  /** Set when kind = 'recipe'. */
  recipeId?: string;
  snapshot: FoodSnapshot;
  quantity: Quantity;
  /** Resolved gram weight of `quantity`. */
  grams: number;
  /** Absolute nutrients for this entry (snapshot × grams). */
  nutrients: NutrientValues;
  note?: string;
  origin?: EntryOrigin;
  /** Local photo (see `photos` table) attached to this entry. */
  photoId?: string;
  /** When the user says it was eaten / logged (used for "recent" ordering). */
  loggedAt: IsoTimestamp;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

export interface RecipeIngredient {
  id: string;
  foodId: string;
  quantity: Quantity;
  /** Resolved grams of the quantity. */
  grams: number;
  /** Snapshot used if the food is later deleted. */
  snapshot: FoodSnapshot;
  note?: string;
}

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  /** Number of servings the recipe yields (> 0). */
  servings: number;
  ingredients: RecipeIngredient[];
  /**
   * Final cooked weight in grams, if measured. When absent the raw ingredient weight sum is used
   * to compute per-100 g values (water loss is not guessed).
   */
  cookedWeightGrams?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  mealTypes: MealType[];
  instructions: string[];
  tags: string[];
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** Calculated nutrition for a recipe. */
export interface RecipeNutrition {
  recipeId: string;
  totalGrams: number;
  servings: number;
  gramsPerServing: number;
  total: NutrientTotals;
  perServing: NutrientTotals;
  /** Per 100 g of finished recipe (as NutrientValues, ready for snapshots). */
  per100g: NutrientValues;
  /** Ingredient ids whose food no longer exists (snapshot was used). */
  ingredientsUsingSnapshot: string[];
}

// ---------------------------------------------------------------------------
// Goals & preferences
// ---------------------------------------------------------------------------

/**
 * - `atLeast`: reaching the amount is the goal (protein, fiber, vitamins)
 * - `atMost`: staying under is the goal (sodium, saturated fat, sugar)
 * - `around`: close to the amount (calories, carbs, fat); tolerance defaults to ±10 %
 */
export type TargetDirection = 'atLeast' | 'atMost' | 'around';

export interface NutrientTarget {
  amount: number;
  direction: TargetDirection;
  /** Fractional tolerance for `around` targets (default 0.1). */
  tolerance?: number;
  /** Where the value came from. Reference values are informational only, not medical advice. */
  origin: 'user' | 'reference';
}

/** Daily targets, effective from a given local date (history keeps old goals). */
export interface DailyGoals {
  id: string;
  effectiveFrom: LocalDate;
  targets: Partial<Record<NutrientId, NutrientTarget>>;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export type DietType = 'vegan' | 'vegetarian' | 'pescatarian' | 'gluten_free' | 'dairy_free';

export interface UserPreferences {
  id: 'user';
  diets: DietType[];
  allergies: Allergen[];
  dislikedFoodIds: string[];
  /** Free-text dislikes matched against food names, e.g. ["olive", "liver"]. */
  dislikedKeywords: string[];
  favoriteFoodIds: string[];
  favoriteRecipeIds: string[];
  /** Ingredients currently at home (food ids). */
  availableIngredientIds: string[];
  /** Default max preparation time for recommendations. */
  maxPrepTimeMinutes?: number;
  /** 0 = Sunday, 1 = Monday */
  weekStartsOn: 0 | 1;
  unitSystem: 'metric' | 'imperial';
  updatedAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Summaries / analytics
// ---------------------------------------------------------------------------

export interface GoalProgress {
  nutrientId: NutrientId;
  target: NutrientTarget;
  consumed: number;
  /** target - consumed (negative when over). */
  remaining: number;
  /** consumed / target × 100, unrounded. */
  percent: number;
  /** Evaluated per direction/tolerance. */
  status: 'met' | 'under' | 'over';
  /** Intake might be higher than shown because data was missing. */
  isLowerBound: boolean;
}

export interface MealTypeSummary {
  mealType: MealType;
  entryCount: number;
  totals: NutrientTotals;
}

export interface DailyNutritionSummary {
  date: LocalDate;
  entryCount: number;
  totals: NutrientTotals;
  byMeal: Record<MealType, MealTypeSummary>;
  goals: DailyGoals | null;
  progress: Partial<Record<NutrientId, GoalProgress>>;
  /** Shortcut: energy remaining (null when no calorie goal). */
  remainingCalories: number | null;
}

export interface WeeklyNutritionSummary {
  startDate: LocalDate;
  endDate: LocalDate;
  /** Days with at least one entry. */
  loggedDays: number;
  /** Averages over logged days only (unlogged days are unknown, not zero). */
  averages: NutrientTotals;
  days: DailyNutritionSummary[];
  /** Per nutrient: how many logged days met the target. */
  adherence: Partial<Record<NutrientId, { daysMet: number; daysEvaluated: number; ratio: number }>>;
}

export interface NutrientTrendPoint {
  date: LocalDate;
  logged: boolean;
  /** null when the day had no entries. */
  amount: number | null;
  coverageRatio: number | null;
  target: number | null;
}

export interface FrequentFood {
  key: string;
  foodId?: string;
  recipeId?: string;
  name: string;
  count: number;
  totalGrams: number;
  lastLoggedAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface FoodSearchResult {
  food: Food;
  /** Higher is better. Relative only within one result list. */
  score: number;
  matchType: 'barcode' | 'exact' | 'prefix' | 'tokens' | 'partial';
  isFavorite: boolean;
  useCount: number;
  lastUsedAt?: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

export type RecommendationIntent =
  | 'meal' // e.g. "suggest dinner"
  | 'high_protein'
  | 'low_calorie'
  | 'high_fiber'
  | 'use_ingredients'
  | 'micronutrient'
  | 'fit_remaining';

export interface RecommendationRequest {
  intent: RecommendationIntent;
  mealType?: MealType;
  /** Required for intent = 'micronutrient'. */
  nutrientId?: NutrientId;
  /** Food ids to build from (defaults to preferences.availableIngredientIds for use_ingredients). */
  ingredientIds?: string[];
  maxPrepTimeMinutes?: number;
  maxCalories?: number;
  /** Day used for current intake (default today). */
  date?: LocalDate;
  limit?: number;
}

export interface RecommendationIngredient {
  foodId: string;
  name: string;
  grams: number;
  quantityLabel: string;
}

export interface Recommendation {
  id: string;
  /** 'ai' = proposed by the AI provider (nutrition still computed locally); 'rules' = local engine. */
  source?: 'rules' | 'ai';
  kind: 'food' | 'recipe' | 'combo';
  name: string;
  mealType?: MealType;
  ingredients: RecommendationIngredient[];
  /** Calculated from food data for the suggested quantities. */
  nutrition: NutrientTotals;
  /** null when unknown. */
  prepTimeMinutes: number | null;
  explanation: string[];
  /** 0–100 */
  score: number;
  scoreBreakdown: Record<string, number>;
  recipeId?: string;
}

export interface ParsedIntent {
  request: Omit<RecommendationRequest, 'ingredientIds'>;
  /** Free-text ingredient words found in the request (resolved to foods by the service). */
  ingredientTerms: string[];
  /** 0..1, how sure the parser is. */
  confidence: number;
  matchedRules: string[];
}

// ---------------------------------------------------------------------------
// Barcode cache
// ---------------------------------------------------------------------------

export interface CachedProduct {
  barcode: string;
  status: 'found' | 'not_found';
  food?: Food;
  fetchedAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Backup
// ---------------------------------------------------------------------------

export const BACKUP_FORMAT = 'nutrition_app_backup' as const;
export const BACKUP_SCHEMA_VERSION = 1 as const;

export interface BackupPayload {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: IsoTimestamp;
  appVersion: string;
  dbVersion: number;
  data: {
    /** User-created and Open Food Facts foods (seed foods are re-creatable and excluded by default). */
    foods: Food[];
    mealEntries: MealEntry[];
    recipes: Recipe[];
    goals: DailyGoals[];
    preferences: UserPreferences[];
    cachedProducts?: CachedProduct[];
  };
  counts: Record<string, number>;
  /** FNV-1a hash of JSON.stringify(data) for integrity checking. */
  checksum: string;
}

// ---------------------------------------------------------------------------
// Photos & AI
// ---------------------------------------------------------------------------

/** A meal photo stored locally on the device (never uploaded except to the AI provider when the user opts in). */
export interface StoredPhoto {
  id: string;
  mimeType: string;
  data: ArrayBuffer;
  byteLength: number;
  width?: number;
  height?: number;
  createdAt: IsoTimestamp;
}

export type AiProvider = 'gemini';

/**
 * AI configuration, stored only on the device (meta table, excluded from backups).
 * AI features stay off until the user adds their own free API key AND accepts the privacy notice.
 */
export interface AiSettings {
  provider: AiProvider;
  apiKey: string | null;
  /** Model id, e.g. "gemini-flash-latest". */
  model: string;
  photoRecognitionEnabled: boolean;
  aiSuggestionsEnabled: boolean;
  /** When the user accepted AI_PRIVACY_NOTICE; null = not accepted (AI disabled). */
  consentAcceptedAt: IsoTimestamp | null;
}

/** What the AI saw in the photo. `estimatedGrams` is a visual ESTIMATE the user must confirm. */
export interface DetectedFood {
  name: string;
  searchTerms: string[];
  estimatedGrams: number;
  /** 0..1 as reported by the model (not calibrated). */
  confidence: number;
  preparation?: string;
}

export interface PhotoRecognitionItem {
  id: string;
  detected: DetectedFood;
  /** Local foods matching the detection, best first (nutrition always comes from these). */
  matches: FoodSearchResult[];
  /** Pre-selected match (null when nothing in the database matched → user must search or create a food). */
  selectedFoodId: string | null;
  grams: number;
  /** Nutrients for `grams` of the selected food (empty when unmatched). */
  nutrients: NutrientValues;
}

export interface PhotoRecognitionResult {
  id: string;
  isFood: boolean;
  description: string;
  items: PhotoRecognitionItem[];
  /** Totals over matched items only. */
  totals: NutrientTotals;
  unmatchedCount: number;
  photoId?: string;
  provider: AiProvider;
  model: string;
  createdAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Personal profile & personalised targets (EU / Spanish references)
// ---------------------------------------------------------------------------

export type Sex = 'female' | 'male';

/** EFSA physical activity levels (PAL 1.4 / 1.6 / 1.8 / 2.0). */
export type ActivityLevel = 'sedentary' | 'moderate' | 'active' | 'very_active';

export type WeightObjective = 'lose' | 'maintain' | 'gain';

/**
 * The user's body data, stored only on the device (meta table). Used solely to calculate
 * daily targets. Adults (18+) only: the EFSA/AESAN references used are for adults.
 */
export interface UserProfile {
  sex: Sex;
  /** Stored instead of age so the targets stay right as years pass. */
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  objective: WeightObjective;
  updatedAt: IsoTimestamp;
}

/** How the targets were derived — shown to the user. */
export interface TargetBreakdown {
  age: number;
  bmi: number;
  /** Resting energy expenditure, Henry (2005) equations as used by EFSA (2013). kcal/day. */
  restingKcal: number;
  pal: number;
  /** restingKcal × pal */
  maintenanceKcal: number;
  /** Change applied for the objective (negative = deficit), after safety floors. kcal/day. */
  adjustmentKcal: number;
  energyKcal: number;
  proteinGPerKg: number;
  /** Body weight used for protein (actual; ESPEN adjusted weight from BMI 30). */
  proteinReferenceWeightKg: number;
  fatPercentEnergy: number;
  carbPercentEnergy: number;
  /** e.g. "Women 20–49 (AESAN 2019)". */
  micronutrientReference: string;
  /** Safety notes (e.g. floor applied, weight loss not advised at this BMI). */
  warnings: string[];
  sources: string[];
}

export interface PersonalTargets {
  targets: DailyGoals['targets'];
  breakdown: TargetBreakdown;
}
