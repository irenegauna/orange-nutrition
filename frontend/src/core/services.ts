/**
 * Service interface the screens use. Implemented by `src/services/orangeBackend.ts`, a thin
 * adapter over the real backend (`nutrition_app`). All nutrition math (scaling servings, summing
 * totals, coverage, adherence, recipe calculation) happens in the backend — never in React.
 */
import type {
  AiStatus,
  PhotoAnalysis,
  ProfileInput,
  ProfileState,
  Macros,
  AssistantReply,
  ChatTurn,
  BackupExport,
  BackupValidation,
  BarcodeResult,
  CustomFoodInput,
  DailyInsight,
  DaySummary,
  Food,
  Goals,
  HistoryRange,
  ISODate,
  LogEntry,
  MealType,
  MicronutrientKey,
  NutrientDetail,
  NutrientReport,
  Preferences,
  Quantity,
  Recipe,
  RecipeDraft,
  RecipeNutrition,
  Recommendation,
} from './types'

export interface FoodService {
  search(query: string): Promise<Food[]>
  get(id: string): Promise<Food | null>
  recent(limit?: number): Promise<Food[]>
  favorites(): Promise<Food[]>
  setFavorite(id: string, favorite: boolean): Promise<void>
  createCustom(input: CustomFoodInput): Promise<Food>
  /** Nutrition for a food at a quantity (used for live previews). */
  preview(foodId: string, quantity: Quantity): Promise<import('./types').NutritionValues>
}

export interface BarcodeService {
  lookup(barcode: string): Promise<BarcodeResult>
}

export interface DiaryService {
  addEntry(input: { date: ISODate; meal: MealType; foodId: string; quantity: Quantity }): Promise<LogEntry>
  updateEntry(id: string, patch: { meal?: MealType; quantity?: Quantity }): Promise<LogEntry>
  deleteEntry(id: string): Promise<void>
  logRecipe(input: { date: ISODate; meal: MealType; recipeId: string; servings: number }): Promise<LogEntry>
  logRecommendation(input: { date: ISODate; meal: MealType; recommendation: Recommendation }): Promise<LogEntry>
}

export interface SummaryService {
  getDay(date: ISODate): Promise<DaySummary>
  getNutrients(date: ISODate): Promise<NutrientReport>
  getNutrientDetail(date: ISODate, key: MicronutrientKey): Promise<NutrientDetail>
}

export interface RecipeService {
  list(): Promise<Recipe[]>
  get(id: string): Promise<Recipe | null>
  calculate(draft: RecipeDraft): Promise<RecipeNutrition>
  save(draft: RecipeDraft): Promise<Recipe>
  /** Recipes that are the home-made version of a measured dish food. */
  forDish(foodId: string): Promise<Recipe[]>
  /** Gemini drafts a typical recipe ("cocido madrileño"); ingredients matched to the catalog. Not saved. */
  draftWithAI(input: { dish: string; servings?: number }): Promise<import('./types').AiRecipeDraft>
  delete(id: string): Promise<void>
}

export interface RecommendationService {
  /** Uses Gemini when the AI assistant is enabled, otherwise (or on AI failure) the rule engine. */
  ask(message: string, context: { date: ISODate; history?: ChatTurn[] }): Promise<AssistantReply>
  getDailyInsights(date: ISODate): Promise<DailyInsight[]>
  /** Prompts the rule engine supports, for the suggestion chips. */
  suggestedPrompts(): Promise<string[]>
}

export interface HistoryService {
  getRange(start: ISODate, end: ISODate): Promise<HistoryRange>
}

export interface GoalService {
  get(): Promise<Goals>
  update(goals: Goals): Promise<Goals>
}

export interface PreferenceService {
  get(): Promise<Preferences>
  update(prefs: Preferences): Promise<Preferences>
}

export interface BackupService {
  export(): Promise<BackupExport>
  validate(file: unknown): Promise<BackupValidation>
  /** Replaces all local data with the backup's contents. */
  import(file: unknown): Promise<void>
}

export interface AiService {
  status(): Promise<AiStatus>
  setApiKey(key: string | null): Promise<AiStatus>
  acceptPrivacyNotice(): Promise<AiStatus>
  revokeConsent(forgetKey?: boolean): Promise<AiStatus>
  setAssistantEnabled(enabled: boolean): Promise<AiStatus>
  setPhotoEnabled(enabled: boolean): Promise<AiStatus>
  test(): Promise<{ ok: boolean; message: string }>
}

/** Meal photo → foods (Gemini names foods and estimates grams; nutrition comes from the database). */
export interface PhotoService {
  analyze(image: Blob, opts: { meal: MealType; hint?: string }): Promise<PhotoAnalysis>
  /** Send a correction ("te has dejado el huevo"): same photo + current list → corrected list. */
  refine(input: {
    photoId: string
    feedback: string
    current: { name: string; grams: number; foodId?: string | null; partOf?: string }[]
    previousFeedback?: string[]
    meal: MealType
  }): Promise<PhotoAnalysis>
  /** Re-run database matching for a food name (e.g. after the user renames an item). */
  rematch(name: string): Promise<import('./types').Food[]>
  /** Totals for the confirmed items, computed by the backend. */
  totals(items: { foodId: string; grams: number }[]): Promise<Macros>
  log(input: { date: ISODate; meal: MealType; photoId?: string; items: { foodId: string; grams: number }[] }): Promise<LogEntry[]>
  /** Delete a stored photo the user decided not to log. */
  discard(photoId: string): Promise<void>
}

/** Body data → calculated daily targets (EU / Spanish references). */
export interface ProfileService {
  get(): Promise<ProfileState | null>
  /** Saves the profile and replaces today's targets with the calculated ones. */
  save(input: ProfileInput): Promise<ProfileState>
}

export interface NutritionBackend {
  foods: FoodService
  barcode: BarcodeService
  diary: DiaryService
  summaries: SummaryService
  recipes: RecipeService
  recommendations: RecommendationService
  history: HistoryService
  goals: GoalService
  preferences: PreferenceService
  backup: BackupService
  ai: AiService
  profile: ProfileService
  photo: PhotoService
}
