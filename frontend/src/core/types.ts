/**
 * UI view-model types.
 *
 * The real domain model lives in the backend (`nutrition_app/src/core/types`). Screens consume
 * these simpler shapes; `src/services/orangeBackend.ts` maps backend data into them. No nutrition
 * math happens in the mapping beyond picking values the backend already computed.
 */

/** Calendar day in local time, formatted `yyyy-MM-dd`. */
export type ISODate = string

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks'
export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snacks'] as const

export type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'

export type MicronutrientKey =
  | 'vitaminA'
  | 'vitaminC'
  | 'vitaminD'
  | 'vitaminE'
  | 'vitaminK'
  | 'thiamin'
  | 'riboflavin'
  | 'niacin'
  | 'vitaminB6'
  | 'folate'
  | 'vitaminB12'
  | 'calcium'
  | 'iron'
  | 'magnesium'
  | 'phosphorus'
  | 'potassium'
  | 'sodium'
  | 'zinc'
  | 'selenium'
  | 'pantothenicAcid'
  | 'biotin'
  | 'copper'
  | 'manganese'
  | 'iodine'
  | 'sugar'
  | 'saturatedFat'

export type NutrientGroup = 'vitamins' | 'minerals' | 'other'

export interface NutrientInfo {
  key: MicronutrientKey
  label: string
  unit: 'g' | 'mg' | 'µg'
  group: NutrientGroup
  /** When true, the reference value is an upper limit rather than a goal (e.g. sodium). */
  isLimit?: boolean
}

/** Static nutrient metadata (labels/units). Contains no user data. */
export const NUTRIENTS: Record<MicronutrientKey, NutrientInfo> = {
  vitaminA: { key: 'vitaminA', label: 'Vitamina A', unit: 'µg', group: 'vitamins' },
  vitaminC: { key: 'vitaminC', label: 'Vitamina C', unit: 'mg', group: 'vitamins' },
  vitaminD: { key: 'vitaminD', label: 'Vitamina D', unit: 'µg', group: 'vitamins' },
  vitaminE: { key: 'vitaminE', label: 'Vitamina E', unit: 'mg', group: 'vitamins' },
  vitaminK: { key: 'vitaminK', label: 'Vitamina K', unit: 'µg', group: 'vitamins' },
  thiamin: { key: 'thiamin', label: 'Tiamina (B1)', unit: 'mg', group: 'vitamins' },
  riboflavin: { key: 'riboflavin', label: 'Riboflavina (B2)', unit: 'mg', group: 'vitamins' },
  niacin: { key: 'niacin', label: 'Niacina (B3)', unit: 'mg', group: 'vitamins' },
  pantothenicAcid: { key: 'pantothenicAcid', label: 'Ácido pantoténico (B5)', unit: 'mg', group: 'vitamins' },
  biotin: { key: 'biotin', label: 'Biotina (B7)', unit: 'µg', group: 'vitamins' },
  vitaminB6: { key: 'vitaminB6', label: 'Vitamina B6', unit: 'mg', group: 'vitamins' },
  folate: { key: 'folate', label: 'Folato', unit: 'µg', group: 'vitamins' },
  vitaminB12: { key: 'vitaminB12', label: 'Vitamina B12', unit: 'µg', group: 'vitamins' },
  calcium: { key: 'calcium', label: 'Calcio', unit: 'mg', group: 'minerals' },
  iron: { key: 'iron', label: 'Hierro', unit: 'mg', group: 'minerals' },
  magnesium: { key: 'magnesium', label: 'Magnesio', unit: 'mg', group: 'minerals' },
  phosphorus: { key: 'phosphorus', label: 'Fósforo', unit: 'mg', group: 'minerals' },
  potassium: { key: 'potassium', label: 'Potasio', unit: 'mg', group: 'minerals' },
  sodium: { key: 'sodium', label: 'Sodio', unit: 'mg', group: 'minerals', isLimit: true },
  zinc: { key: 'zinc', label: 'Zinc', unit: 'mg', group: 'minerals' },
  selenium: { key: 'selenium', label: 'Selenio', unit: 'µg', group: 'minerals' },
  copper: { key: 'copper', label: 'Cobre', unit: 'mg', group: 'minerals' },
  manganese: { key: 'manganese', label: 'Manganeso', unit: 'mg', group: 'minerals' },
  iodine: { key: 'iodine', label: 'Yodo', unit: 'µg', group: 'minerals' },
  sugar: { key: 'sugar', label: 'Azúcares', unit: 'g', group: 'other', isLimit: true },
  saturatedFat: { key: 'saturatedFat', label: 'Grasas saturadas', unit: 'g', group: 'other', isLimit: true },
}

export interface Macros {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

/** Missing keys mean "unknown", never zero. */
export type Micronutrients = Partial<Record<MicronutrientKey, number>>

export interface NutritionValues extends Macros {
  micros: Micronutrients
}

export interface Serving {
  /** Backend serving id; absent for plain grams. */
  id?: string
  label: string
  grams: number
}

export type FoodSource = 'catalog' | 'custom' | 'barcode' | 'recipe' | 'dev-fixture'

export interface Food {
  id: string
  name: string
  brand?: string
  barcode?: string
  source: FoodSource
  /** Nutrition per 100 g. */
  per100g: NutritionValues
  /** Available servings; the first is the default. */
  servings: Serving[]
  isFavorite?: boolean
  /** Data provenance to display (e.g. USDA FoodData Central, Open Food Facts — ODbL). */
  attribution?: string
  /** Backend food category (fruits, dairy, …) — used for display (emoji) only. */
  category?: string
}

export interface Quantity {
  amount: number
  serving: Serving
}

export interface LogEntry {
  id: string
  date: ISODate
  meal: MealType
  foodId?: string
  recipeId?: string
  name: string
  brand?: string
  quantity: Quantity
  /** Nutrition for this entry's quantity, computed by the backend. */
  nutrition: NutritionValues
  createdAt: string
  /** Food category ('recipe' for recipes) — display only. */
  category?: string
}

export interface MealSummary {
  meal: MealType
  entries: LogEntry[]
  totals: Macros
}

export interface DaySummary {
  date: ISODate
  goals: Goals
  totals: NutritionValues
  /** Target minus consumed; may be negative. */
  remaining: Macros
  meals: Record<MealType, MealSummary>
  entryCount: number
}

export interface NutrientContributor {
  name: string
  amount: number
}

export interface NutrientCoverage {
  key: MicronutrientKey
  /** Sum across entries that report this nutrient. */
  intake: number
  target: number | null
  /** intake / target × 100, or null when no target. */
  percentOfTarget: number | null
  /** Fraction (0..1) of the day's entries whose food data reports this nutrient. */
  completeness: number
  reportingEntries: number
  totalEntries: number
  contributors: NutrientContributor[]
}

export interface NutrientReport {
  date: ISODate
  entryCount: number
  nutrients: NutrientCoverage[]
}

export interface NutrientDetail {
  coverage: NutrientCoverage
  info: NutrientInfo
  /** Foods rich in this nutrient, from the backend's catalog. */
  suggestions: Food[]
}

export interface CustomFoodInput {
  name: string
  brand?: string
  barcode?: string
  serving: Serving
  /** Nutrition for ONE serving as entered by the user. */
  perServing: NutritionValues
}

export interface RecipeIngredient {
  foodId: string
  foodName: string
  quantity: Quantity
  /** e.g. "para freír: solo lo que absorbe". */
  note?: string
}

export interface RecipeDraft {
  id?: string
  name: string
  servings: number
  ingredients: RecipeIngredient[]
  instructions?: string[]
  /** The measured dish (BEDCA/CIQUAL) this is a home-made version of. */
  dishFoodId?: string
}

/** Gemini's draft of a recipe — ingredients already matched to catalog foods, nothing saved yet. */
export interface AiRecipeDraft {
  draft: RecipeDraft
  /** Ingredients Gemini named that the catalog doesn't have (add them by hand). */
  unmatched: { name: string; grams: number }[]
  model: string
}

export interface RecipeNutrition {
  total: NutritionValues
  perServing: NutritionValues
  totalGrams: number
}

export interface Recipe extends RecipeDraft {
  id: string
  /** One of the app's classic Spanish recipes, untouched by the user. */
  builtin: boolean
  instructions: string[]
  prepMinutes?: number
  tags: string[]
  nutrition: RecipeNutrition
  createdAt: string
  updatedAt: string
}

export interface Goals {
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  micros: Micronutrients
}

export type ThemePreference = 'system' | 'light' | 'dark'

/** The 14 EU allergens (Reg. 1169/2011 Annex II), as ids understood by the backend. */
export const ALLERGENS = [
  { id: 'gluten', label: 'Gluten' },
  { id: 'wheat', label: 'Trigo' },
  { id: 'shellfish', label: 'Crustáceos' },
  { id: 'egg', label: 'Huevos' },
  { id: 'fish', label: 'Pescado' },
  { id: 'peanuts', label: 'Cacahuetes' },
  { id: 'soy', label: 'Soja' },
  { id: 'milk', label: 'Leche' },
  { id: 'tree_nuts', label: 'Frutos de cáscara' },
  { id: 'celery', label: 'Apio' },
  { id: 'mustard', label: 'Mostaza' },
  { id: 'sesame', label: 'Sésamo' },
  { id: 'sulphites', label: 'Sulfitos' },
  { id: 'lupin', label: 'Altramuces' },
  { id: 'molluscs', label: 'Moluscos' },
] as const

export interface Preferences {
  /** 'vegetarian' | 'vegan' | 'pescatarian' | 'gluten-free' | 'dairy-free' */
  dietary: string[]
  /** Allergen ids from ALLERGENS. Hard exclusions in recommendations. */
  allergies: string[]
  /** Free-text keywords matched against food names. */
  dislikedFoods: string[]
  theme: ThemePreference
  displayName?: string
}

export interface RecommendationIngredient {
  name: string
  amount: string
  foodId?: string
}

export interface Recommendation {
  id: string
  name: string
  ingredients: RecommendationIngredient[]
  nutrition: Macros
  /** null when the backend has no estimate. */
  prepMinutes: number | null
  explanation: string
  steps?: string[]
  tags?: string[]
  suggestedMeal?: MealType
}

export interface AssistantReply {
  id: string
  text: string
  recommendations: Recommendation[]
  /** Follow-up prompts the engine can actually handle. */
  followUps?: string[]
  /** 'ai' = answered by Gemini; 'rules' = local rule-based engine. */
  source?: 'ai' | 'rules'
  /** Shown under the reply, e.g. why the AI wasn't used this time. */
  notice?: string
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

/** AI (Gemini) configuration as the UI sees it. The API key itself is never exposed. */
export interface AiStatus {
  hasApiKey: boolean
  apiKeyHint: string | null
  consentAccepted: boolean
  assistantEnabled: boolean
  /** Key + consent + switch on. */
  assistantAvailable: boolean
  photoEnabled: boolean
  /** Key + consent + photo switch on. */
  photoAvailable: boolean
  model: string
  privacyNotice: string
}

export interface DailyInsight {
  id: string
  kind: 'protein' | 'fiber' | 'calories' | 'micronutrient' | 'general'
  title: string
  message: string
  action?: { label: string; prompt: string }
}

export type AdherenceStatus = 'none' | 'under' | 'within' | 'over'

export interface DayStat {
  date: ISODate
  logged: boolean
  totals: Macros
  micros: Micronutrients
  targets: Macros
  adherence: AdherenceStatus
}

export interface HistoryRange {
  start: ISODate
  end: ISODate
  days: DayStat[]
  /** Averages over logged days only. */
  averages: Macros
  daysLogged: number
  daysWithinCalorieGoal: number
  daysMeetingProtein: number
  daysMeetingFiber: number
}

export interface BackupExport {
  json: string
  filename: string
}

export interface BackupValidation {
  ok: boolean
  error?: string
  summary?: { entries: number; foods: number; recipes: number; exportedAt: string }
}

export type BarcodeResult =
  | { status: 'found'; food: Food }
  | { status: 'not_found'; barcode: string }
  | { status: 'error'; barcode: string; message: string }

/** One food Gemini saw in a meal photo, matched to the local food database. */
export interface PhotoItem {
  id: string
  /** What the AI called it, e.g. "chicken breast, grilled". */
  name: string
  /** Visual ESTIMATE from the AI — the user confirms or edits it. */
  estimatedGrams: number
  /** 0..1 as reported by the model (not calibrated). */
  confidence: number
  preparation?: string
  /** Local foods that match, best first. Nutrition always comes from these. */
  matches: Food[]
  /** Pre-selected match; null when nothing in the database matched. */
  selectedFoodId: string | null
  /** Grams for the match (from a standard portion when `portion` is set, else the visual estimate). */
  grams: number
  /** e.g. { count: 0.5, servingLabel: '1 tortilla entera (≈ 700 g)' } — grams came from the database portion. */
  portion?: { count: number; servingLabel: string }
}

export interface PhotoAnalysis {
  isFood: boolean
  description: string
  items: PhotoItem[]
  /** Stored on the device; attached to the entries when logged. */
  photoId?: string
  /** Gemini's short reply after a correction. */
  reply?: string
  model: string
}

// ── Personal profile (targets are calculated from it, never typed in) ───
export type Sex = 'female' | 'male'
export type ActivityLevel = 'sedentary' | 'moderate' | 'active' | 'very_active'
export type WeightObjective = 'lose' | 'maintain' | 'gain'

export interface ProfileInput {
  sex: Sex
  age: number
  heightCm: number
  weightKg: number
  activity: ActivityLevel
  objective: WeightObjective
}

/** How the backend derived the targets (EFSA / EASO / AESAN). */
export interface TargetBreakdown {
  age: number
  bmi: number
  restingKcal: number
  pal: number
  maintenanceKcal: number
  adjustmentKcal: number
  energyKcal: number
  proteinGPerKg: number
  proteinReferenceWeightKg: number
  fatPercentEnergy: number
  carbPercentEnergy: number
  micronutrientReference: string
  warnings: string[]
  sources: string[]
}

export interface ProfileState {
  profile: ProfileInput
  targets: Goals
  breakdown: TargetBreakdown
}
