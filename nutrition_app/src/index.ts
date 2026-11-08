/**
 * nutrition_app — local-first nutrition data layer.
 *
 * Frontend usage:
 *   import { initializeApp, addMealEntry, getDailySummary, searchFoods } from 'nutrition_app';
 *   await initializeApp(); // once at startup (opens IndexedDB, seeds USDA foods if needed)
 *
 * See docs/SERVICE_API.md for the full API.
 */
export * from './core/types';
export * from './core/constants';
export * from './core/utils';
export * from './core/nutrition';
export * from './core/validation';
export {
  checkFoodRestrictions,
  checkAllRestrictions,
  parseIntent,
  generateRecommendations,
  computeBudget,
  DIET_EXCLUDED_FLAGS,
  ALLERGEN_KEYWORDS,
  INTENT_WEIGHTS,
  type RecommendationContext,
  type RecipeCandidateInput,
  type FilterResult,
  type ScoreComponent,
  type CalorieBudget,
} from './core/recommendations';
export { NutritionDB, getDb, setDb, deleteDatabase, requestPersistentStorage, getStorageEstimate, type FoodRecord } from './data/db';
export { CURRENT_DB_VERSION } from './data/migrations';
export { seedDatabase, SEED_FOODS, type SeedResult } from './data/seed';
export { seedClassicRecipes, classicRecipeId, type ClassicSeedResult, type ClassicRecipeDef } from './data/seed/classicRecipes';
export { CLASSIC_RECIPES, CLASSIC_RECIPES_VERSION } from './data/seed/classicRecipesData';
export { nutrientDefinitionRepository } from './data/repositories';
export * from './services';
export { OpenFoodFactsClient, OpenFoodFactsError, normalizeOffProduct, normalizeOffNutrients, type OffClientOptions, type OffErrorCode } from './integrations/openFoodFacts';
export { GeminiClient, GeminiError, DEFAULT_GEMINI_MODEL, GEMINI_FALLBACK_MODELS, type GeminiErrorCode, type GeminiClientOptions } from './integrations/gemini';
export { evaluateExternalCandidate, allowedFoodPool, type ExternalCandidate, type ExternalEvaluation } from './core/recommendations';
export { initializeApp, type InitializeResult } from './init';
