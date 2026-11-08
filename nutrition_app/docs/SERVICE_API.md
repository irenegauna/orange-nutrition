# nutrition_app — Service API (for the frontend)

Everything is exported from `src/index.ts`. All service functions are `async`, run **entirely on the device**
(IndexedDB via Dexie), and throw `DataError` (`code`: `NOT_FOUND | VALIDATION | CONFLICT | QUOTA | DB | CONVERSION | UNAVAILABLE`)
with a human-readable `message` and optional `details` (e.g. a list of validation issues).

```ts
import { initializeApp, searchFoods, addMealEntry, getDailySummary, today } from './nutrition_app/src';

await initializeApp();               // once at startup: opens DB, runs migrations, seeds USDA foods, purges stale cache
const results = await searchFoods('greek yogurt');
await addMealEntry({ date: today(), mealType: 'breakfast', foodId: results[0].food.id, quantity: { amount: 170, unit: 'g' } });
const summary = await getDailySummary();   // totals, per meal, goal progress, remaining calories
```

## Language

The app is Spanish (Spain): the USDA starter catalog has Spanish names, Spanish-only search aliases and Spanish serving labels (`scripts/usda-selection.ts`, `scripts/servingLabelsEs.ts`; `SEED_VERSION` 3 refreshes installed catalogs). Spanish foods and dishes come from BEDCA (AESAN, `source.type: 'bedca'`, values unmodified, attribution required, non-commercial use only) and a CIQUAL gap-fill (ANSES, `'ciqual'`: tortilla de patatas, calamares a la romana, albóndigas…), with Spanish household portions (loncha, pincho, ración, tortilla entera, croqueta, caña…). Rows with evident source errors are left out, never edited (`EXCLUDED_SEED_IDS` in `data/seed/index.ts`). User-facing texts produced by the backend (recommendation explanations, profile warnings/sources, AI privacy notice, common errors) are Spanish. `parseIntent` understands Spanish and English phrasing. Open Food Facts lookups prefer `product_name_es` (`lc=es`). Gemini is asked for Spanish food names (photos) and Spanish replies. `source.originalName` keeps the USDA English description for attribution.

## Key rules the UI must respect

| Concept | Rule |
|---|---|
| Dates | `LocalDate` = `'YYYY-MM-DD'` in the user's local calendar. Use `today()`, `toLocalDate(date)`, `addDays()`. Never `toISOString().slice(0,10)`. |
| Units | Canonical units per nutrient in `NUTRIENTS[id].unit` (`kcal`, `g`, `mg`, `ug`=µg). Display with `formatNutrientValue` / `formatNutrientTotal` (the only place rounding happens). |
| Missing data | `NutrientValue.status`: `known`, `zero`, `estimated`, `missing`. An absent key = missing. Show "—" for missing, "~" for estimated, "≥" when `isLowerBound`. |
| Coverage vs intake | `NutrientTotal.amount` is intake from items **with data**; `coverage.ratio` (0–1, mass-weighted) is how much of what was eaten had data. Show both; `coverage.withData === 0` means "no data", not 0. |
| History | `MealEntry.snapshot` + `MealEntry.nutrients` are frozen at log time. Editing/deleting foods or recipes never changes past days. |
| Attribution | Show `food.source.attribution` (USDA FoodData Central / "Data from Open Food Facts", ODbL) on food detail screens. |
| Medical | Targets come from the profile (EU/Spanish references, see *Personal profile*) or `defaultEuTargets()`. `REFERENCE_DAILY_VALUES` (FDA) remain for `applyReferenceMicronutrientTargets`. Informational only; no deficiency inference. |

## Startup & storage

| Function | Description |
|---|---|
| `initializeApp(): Promise<InitializeResult>` | Open DB (migrations), idempotent seed, purge expired barcode cache. |
| `requestPersistentStorage(): Promise<boolean>` | Ask the browser not to evict data (call after first user interaction). |
| `getStorageEstimate()` | `{ usage, quota, persisted }` (nulls when unsupported). |
| `seedDatabase({ force? })` | Re-run seeding (normally automatic). |
| `deleteDatabase()` | Irreversible wipe (use after an export). |

## Foods

| Function | Description |
|---|---|
| `searchFoods(query, { limit?, category?, includeArchived? }): Promise<FoodSearchResult[]>` | Offline token-prefix search over names/brands/aliases; digit-only queries also match barcodes. Ranked by match quality, favorites, usage, completeness. |
| `getFood(id)` / `getFoods(ids)` / `listFoods({ sourceType?, includeArchived? })` | Reads. |
| `createCustomFood(input: CustomFoodInput)` | User food. Only include nutrients you know; use `{status:'zero',amount:0}` for declared zeros. `allergenInfoConfirmed: true` only if the user confirmed the allergen list. |
| `updateFood(id, patch)` | Edits user foods in place; editing a USDA/OFF food creates a custom copy. |
| `deleteFood(id)` | Deletes user foods, archives USDA/OFF foods. |
| `setFoodFavorite(id, bool)` / `getFavoriteFoods()` | Favorites (stored in preferences). |
| `getRecentFoods(limit?)` | Distinct recently logged foods, newest first (`food` may be null if deleted; `lastEntry` always present). |

## Barcode (Open Food Facts)

The frontend handles the camera + detection and passes the decoded string.

| Function | Description |
|---|---|
| `getFoodByBarcode(barcode): Promise<Food \| null>` | `Food` if found (local, cache or network), `null` if the product doesn't exist. Throws `DataError('VALIDATION')` for malformed codes and `DataError('UNAVAILABLE')` when offline/network failure with no cached copy → offer manual entry. |
| `lookupBarcode(barcode, { forceRefresh? }): Promise<BarcodeLookupResult>` | Same, but returns an explicit outcome: `found` (with `origin: local / cache / network / stale_cache`), `not_found`, `invalid`, `error` (`code: OFFLINE / TIMEOUT / NETWORK / RATE_LIMITED / HTTP / INVALID_RESPONSE`). Preferred for UI. |
| `createFoodForBarcode(barcode, input)` | Manual-entry fallback; the saved user food wins on later scans. |
| `isValidGtin(code)` / `normalizeBarcode(input)` | Helpers. |
| `configureOpenFoodFacts(new OpenFoodFactsClient({ timeoutMs, maxRequestsPerMinute, ... }))` | Optional tuning. |

Behaviour: found products are cached 30 days and saved to `foods` (searchable offline); "not found" is cached 7 days; concurrent lookups of the same code share one request; client-side limit of 30 lookups/minute (OFF allows ~100/min); 8 s timeout; 2 retries with backoff for network/5xx errors only.
**Browser note:** browsers (including iOS Safari) forbid setting `User-Agent` from scripts, so the app identifies itself via `app_name`/`app_version` query parameters; the `User-Agent` header is only sent outside browsers. Only the barcode is sent to OFF, never personal logs.

## Meal logging

| Function | Description |
|---|---|
| `addMealEntry({ date, mealType, foodId, quantity, note?, loggedAt?, origin?, photoId? })` | `quantity` supports `g, kg, mg, oz, lb` always; `serving` with `servingId` (or the default serving); `ml, l, tsp, tbsp, cup, fl_oz` when the food has a density or volume-based serving (else `DataError('CONVERSION')`). |
| `updateMealEntry(id, { quantity?, mealType?, date?, note? \| null })` | Recomputed from the entry's own snapshot. |
| `deleteMealEntry(id)` | |
| `duplicateMealEntry(id, { date?, mealType? })` | |
| `copyMeals({ fromDate, toDate, mealType?, toMealType? })` | Atomic copy of a day or a meal. |
| `getDailyMeals(date): Record<MealType, MealEntry[]>` | Grouped, time-ordered. |
| `getMealsByCategory(date, mealType)` | Uses the `[date+mealType]` index. |
| `calculateDailyTotals(date)` | `{ total, byMeal }` totals. |

## Recipes

| Function | Description |
|---|---|
| `createRecipe({ name, servings, ingredients?: [{ foodId, quantity, note? }], cookedWeightGrams?, prepTimeMinutes?, cookTimeMinutes?, mealTypes?, instructions?, tags? })` | |
| `updateRecipe(id, patch)` | `null` clears optional fields. |
| `deleteRecipe(id)` | Logged entries keep their snapshots. |
| `addIngredient(recipeId, input)` / `updateIngredient(recipeId, ingredientId, { quantity?, note? })` / `removeIngredient(recipeId, ingredientId)` | |
| `getRecipeNutrition(id): RecipeNutrition` | `total`, `perServing` (with coverage), `per100g`, `gramsPerServing`, `ingredientsUsingSnapshot` (deleted foods). Per-100 g uses `cookedWeightGrams` when set, otherwise raw ingredient weight (water loss is never guessed). |
| `logRecipe(recipeId, { date, mealType, servings?, note? })` | Logs N servings as one entry. |
| `listRecipes()` / `searchRecipes(q)` / `setRecipeFavorite(id, bool)` | |
| `getRecipesForDish(foodId)` | Recipes whose `dishFoodId` is that food — the home-made version of a measured dish ("¿La haces en casa?"). |

**Classic Spanish recipes.** `initializeApp()` also runs `seedClassicRecipes()`: ~40 traditional recipes (`data/seed/classicRecipesData.ts`; tortilla, cocido, lentejas, paella, gazpacho, croquetas, postres…) with typical home quantities as raw weights of catalog foods. They carry `builtin: { key, version }` and, when the catalog has the measured dish, `dishFoodId`; the measured dish stays the default for search and photos. Any edit (`updateRecipe`, ingredient changes) removes `builtin`, so the recipe becomes the user's and refreshes (bump `CLASSIC_RECIPES_VERSION`) never overwrite it; deleting a classic is remembered and it is not re-added.

**AI recipe drafts.** `draftRecipeWithAI({ dish, servings?, notes? }): Promise<AiRecipeDraft>` asks Gemini for a typical home recipe and matches each ingredient to local foods (`matches`, `selectedFoodId`, raw `grams`, `note`); `unmatchedCount` counts ingredients the catalog lacks. Gemini never supplies nutrient values. Nothing is saved — review, then `createRecipe` (pass `dishFoodId` if it is a version of a catalog dish). Needs an API key and accepted privacy notice only.

## Goals & preferences

| Function | Description |
|---|---|
| `getGoals(date?)` | Goals in effect on a date (versioned by `effectiveFrom`; past days keep old goals). |
| `setMacroGoals({ calories?, protein?, carbohydrate?, fat?, fiber? }, effectiveFrom?)` | 0 removes a target. |
| `setNutrientTarget(id, { amount, direction, tolerance? } \| null, effectiveFrom?)` | Any nutrient. `direction`: `atLeast`, `atMost`, `around` (±10 % default). |
| `applyReferenceMicronutrientTargets(effectiveFrom?, overwrite?)` | Fill unset micronutrient targets with FDA Daily Values (marked `origin: 'reference'`). |
| `setGoals(targets, effectiveFrom?)` / `listGoalHistory()` | Low-level. |
| `getPreferences()` / `updatePreferences(patch)` | `diets`, `allergies`, `dislikedFoodIds`, `dislikedKeywords`, `favoriteFoodIds`, `favoriteRecipeIds`, `availableIngredientIds`, `maxPrepTimeMinutes`, `weekStartsOn`, `unitSystem`. |
| `setDiets`, `setAllergies`, `setDislikedFood`, `setDislikedKeywords`, `setAvailableIngredients` | Shortcuts. |

## Personal profile & calculated targets (EU / Spanish references)

The user enters sex, age, height, weight, activity level and objective; daily targets are **calculated**, not typed in.
The profile is stored only on the device (`meta` table, key `userProfile`; birth year is stored instead of age) and is not included in JSON backups.

| Function | Description |
|---|---|
| `saveProfile({ sex, age, heightCm, weightKg, activity, objective })` | Validates (adults 18+), stores the profile and writes the calculated targets as goals from today (past days keep their goals). Returns `{ profile, age, personal: { targets, breakdown } }`. |
| `getProfile()` / `getProfileWithTargets()` | Read the profile (null if not set) / profile + targets it implies today. |
| `refreshTargetsForAge()` | Re-writes today's goals if the profile now implies different ones (e.g. after a birthday changes the age band). Call on startup. |
| `computePersonalTargets(profile, date)` | Pure calculation (see below). `breakdown` explains every number (REE, PAL, deficit, protein g/kg, % energy, AESAN band, warnings, sources). |
| `defaultEuTargets()` | Targets for people without a profile: EU Reference Intakes + AESAN. |

How targets are derived (`core/nutrition/requirements.ts`):
- **Energy** — EFSA (2013): REE from the Henry (2005) equations × PAL (`sedentary` 1.4, `moderate` 1.6, `active` 1.8, `very_active` 2.0).
- **Objective** — lose: −600 kcal/day (EASO 2015, ≈ 0.5 kg/week), never below max(REE, 1,200 kcal) (NICE NG246: 800–1,200 kcal only in specialist care); no deficit when BMI < 18.5 (WHO underweight). Gain: +10 % of maintenance (conservative end of Iraki et al. 2019's ~10–20 %).
- **Protein** — EFSA PRI 0.83 g/kg/day; 1.2 g/kg when losing or gaining (lower bound of 1.2–1.6 g/kg for lean-mass preservation, Leidy et al. 2015; within EFSA's ≤ 2× PRI safe range). Actual weight up to BMI 30; ESPEN adjusted body weight (BMI-25 weight + ⅓ of the excess) with obesity.
- **Fat / carbohydrate** — fat 30 % energy, carbohydrate the remainder within EFSA's 45–60 % E. **Fibre** 25 g (EFSA AI).
- **Limits** — sodium 2 g (EFSA 2019); saturated fat ≤ 10 % of energy (WHO 2023); total sugars scaled from the EU Reference Intake (90 g at 2,000 kcal) — WHO's < 10 % E is for *free* sugars, which food data doesn't separate.
- **Accuracy** — Henry predicts REE within ±10 % for ~65–75 % of adults in validation studies; targets are a starting point to adjust from real weight change.
- **Vitamins & minerals** — AESAN (2019) by sex and age band (`aesanMicronutrients`).

Informational only — not medical advice. No other personal or medical data is collected.

## History & analytics

| Function | Description |
|---|---|
| `getDailySummary(date?)` | `DailyNutritionSummary`: totals, `byMeal`, `progress` per targeted nutrient (`consumed`, `remaining`, `percent`, `status`, `isLowerBound`), `remainingCalories`. |
| `getDailySummaries(start, end)` | One indexed range query. |
| `getWeeklySummary(date?)` | Week per `weekStartsOn`. Averages over **logged days only** (`loggedDays`); `adherence` per nutrient. |
| `getPeriodSummary(end?, days = 7)` | Rolling window. |
| `getNutrientTrend(nutrientId, start, end)` | Points with `amount: null` on unlogged days, plus coverage and target. |
| `getGoalAdherence(start, end)` | `{ daysMet, daysEvaluated, ratio }` per nutrient. |
| `getMostFrequentFoods(start, end, limit?)` | |
| `getMealHistory(start, end)` | Entries grouped by date, newest first. |
| `getNutrientCoverage(start, end)` | Per nutrient: `averageCoverage`, `completeDays`, `level: good / partial / poor / none`. |

Pure builders (`buildDailySummary`, `buildPeriodSummary`, `buildTrend`, `coverageIndicators`, `mostFrequentFoods`…) are exported for UI-side reuse.

## Recommendations (rule-based, not a chatbot)

| Function | Description |
|---|---|
| `recommend(request: RecommendationRequest): Promise<Recommendation[]>` | `intent`: `meal`, `high_protein`, `low_calorie`, `high_fiber`, `use_ingredients`, `micronutrient` (needs `nutrientId`), `fit_remaining`. Optional `mealType` (default from local hour), `ingredientIds`, `maxPrepTimeMinutes`, `maxCalories`, `date`, `limit` (default 5). |
| `recommendFromText(text, { limit?, date? })` | Parses common phrases ("high protein snack under 300 kcal", "foods rich in iron", "what can I make with eggs and spinach", "dinner in 20 minutes") → `{ parsed, matchedIngredients, unmatchedTerms, recommendations }`. Check `parsed.confidence`. |
| `parseIntent(text)` | Parser only. |

Each `Recommendation`: `name`, `kind` (`food` / `combo` plate / `recipe`), `ingredients[]` (`foodId`, `name`, `grams`, `quantityLabel`), `nutrition` (`NutrientTotals` computed from food data), `prepTimeMinutes` (estimate or `null`), `explanation[]`, `score` 0–100, `scoreBreakdown`.
Allergies, diets (vegan, vegetarian, pescatarian, gluten_free, dairy_free), disliked foods/keywords and max prep time are **hard exclusions**. Foods with unknown allergen info are excluded when the user has any allergy or diet.

## AI: photo recognition & smart suggestions (Google Gemini, opt-in)

**Models & limits:** default `gemini-3.5-flash-lite` (free tier ≈ 15 requests/min, 500/day), then `gemini-3.5-flash` (≈ 5/min, 20/day) and older Flash/Flash-Lite models. Free quotas are per model: when one model is rate-limited (client-side per-model limiter or Google's 429) the next is tried; only if all are limited is `RATE_LIMITED` returned, with the shortest `retryAfterSeconds`.

AI is **off by default**. To turn it on: (1) the user pastes their own free key from Google AI Studio, (2) accepts `AI_PRIVACY_NOTICE`, (3) enables each feature. The key is stored only on the device (`meta` table) and is never included in backups. Calls go straight from the browser to Google's **Interactions API** (`POST generativelanguage.googleapis.com/v1beta/interactions`). Google retired `generateContent` access to older models for new users, and new-style `AQ.…` keys only work with the Interactions API. CORS is supported for `*.github.io`. The free tier allows **5 requests per minute**: the client enforces this locally, retries temporary "high demand" (503) errors once, then tries the next model.

**The AI never provides nutrient values.** It only names foods and estimates grams (photos) or picks foods and grams from the app's catalog (suggestions). Nutrition is always calculated locally from the database, hard allergy/diet filters are re-applied, and the user confirms before anything is logged.

| Function | Description |
|---|---|
| `AI_PRIVACY_NOTICE` | Text to show before enabling (what is sent, Google free-tier data use). |
| `setAiApiKey(key \| null)` | Save or remove the key. Returns `AiSettingsPublic` (never contains the key; `apiKeyHint` like `…x9Qk`). |
| `acceptAiPrivacyNotice()` / `revokeAiConsent(forgetKey?)` | Consent with timestamp. Revoking turns every AI feature off. |
| `updateAiSettings({ photoRecognitionEnabled?, aiSuggestionsEnabled?, model? })` | Throws `VALIDATION` if there's no key or no consent. Default model: `gemini-3.5-flash`, the most reliable free-tier Flash in live tests (Pro models are paid-only). If a model is retired, overloaded or hangs, it falls back automatically to `gemini-3.5-flash-lite`, then `gemini-3.8-flash`, then `gemini-3.1-flash-lite`, within a ~40 s total budget. Settings saved with retired models (`gemini-flash-latest`, `gemini-2.5-flash`…) are migrated automatically. |
| `getAiSettingsPublic()` | `{ hasApiKey, apiKeyHint, photoRecognitionAvailable, aiSuggestionsAvailable, model, consentAcceptedAt, ... }`. |
| `testAiConnection()` | `{ ok: true, model }` or `{ ok: false, code, message }` (`INVALID_KEY`, `RATE_LIMITED`, `NO_CONSENT`…). |

### Photo → meal flow

```ts
// 1. Frontend: <input type="file" accept="image/*" capture="environment"> → File
const result = await recognizeMealPhoto(file, { mealType: 'lunch', hint: 'no dressing' });
// 2. Show result.items: item.grams (from a catalog portion when item.portion is set — "½ × 1 tortilla entera (≈ 700 g)" —
//    otherwise detected.estimatedGrams, an ESTIMATE), matches[] (local foods),
//    selectedFoodId (may be null → let the user search or create a food), nutrients for the current grams.
//    The user can change the match, edit grams, or remove items.
// 3. Log only what the user confirmed:
await logPhotoMeal({ date: today(), mealType: 'lunch', photoId: result.photoId,
  items: [{ foodId: 'usda_171477', grams: 160 }, { foodId: 'usda_168878', quantity: { amount: 1, unit: 'cup' } }] });
```

| Function | Description |
|---|---|
| `refineMealPhoto({ photoId, feedback, current: { name, grams, foodId? }[], previousFeedback?, mealType? })` | User correction ("te has dejado el huevo", "solo me he comido la mitad"): sends the same stored photo, the current list (with each matched food's standard portions, e.g. `1 tortilla entera = 700 g`) and the correction; returns the full corrected list re-matched to local foods, plus a short `reply`. Nothing is logged. |
| `resolvePortion(food, { count, unit })` | Turns a portion ("½ tortilla entera", "2 croquetas", "1 ración") into grams using the food's own catalog servings; `null` when no serving matches (the item then keeps Gemini's visual estimate and carries `requestedPortion`). |
| `recognizeMealPhoto(image: Blob \| ArrayBuffer, { mealType?, hint?, savePhoto? = true }): Promise<PhotoRecognitionResult>` | Downscales the photo to ≤ 1024 px JPEG on-device, sends it to Gemini, then matches each item to local foods (preferring cooked forms for "grilled/cooked", never dry weights unless stated). Nothing is logged. Throws `DataError('UNAVAILABLE', …, { code })` when AI is off or the provider fails (`RATE_LIMITED`, `OFFLINE`, `INVALID_KEY`…). Fall back to manual search. |
| `matchDetectedFood(detected)` | Re-run matching (e.g. after the user renames an item). |
| `logPhotoMeal({ date, mealType, items: [{ foodId, grams? \| quantity? }], photoId?, note? })` | Atomic. Entries get `origin: 'photo_ai'` and `photoId`. |
| `getPhotoBlob(photoId)` | For `<img src={URL.createObjectURL(blob)}>`. |
| `deletePhoto(id)` / `purgeOrphanPhotos(hours = 24)` | Unconfirmed photos are purged automatically on `initializeApp()`. Deleting the last entry that uses a photo deletes the photo. Photos aren't included in JSON backups. |

### Conversational assistant (chat)

| Function | Description |
|---|---|
| `chatWithAssistant({ message, history?: { role, text }[], date?, now? }): Promise<AssistantChatResult>` | Natural-language chat with Gemini (uses the AI suggestions switch). The model gets today's logged foods, nutrient totals with coverage, 7-day averages, targets, diets/allergies/dislikes and an allergy-filtered food catalog, plus the last 8 turns. Returns `{ text, recommendations, followUps, rejected, model }`. Meal cards are validated locally and their nutrition comes from the database. Throws `DataError('UNAVAILABLE', …, { code })` so the UI can fall back to the rule engine. |

### Smart suggestions

| Function | Description |
|---|---|
| `getSmartSuggestions({ text?, request? }): Promise<SmartSuggestionsResult>` | **Recommended entry point for the suggestions screen.** Uses Gemini when enabled and the rule-based engine otherwise, or on any AI error/quota limit. Result: `{ source: 'ai' \| 'rules', recommendations, fallbackReason?, rejected[] }`. Each `Recommendation` has `source`; AI ones start their `explanation` with the AI's short reason, followed by locally computed facts. |

Only aggregated context is sent: today's macro totals, remaining targets, the calorie budget, diets, available/favorite food ids, and an allergy-filtered catalog of food names with per-100 g macros. Meal history is never sent. Any AI proposal that uses a food outside that catalog, a restricted food, implausible grams, or exceeds the calorie/prep limits is rejected and listed in `rejected`.

## Backup / restore

| Function | Description |
|---|---|
| `exportBackup({ includeSeedFoods?, includeProductCache? }): Promise<BackupPayload>` | Versioned payload with counts and checksum. |
| `exportBackupJson(opts?)` | `{ json, filename }` (create a `Blob`, or use the share sheet on iOS). |
| `validateBackup(jsonOrObject): BackupValidationResult` | Full validation without writing: `{ valid, errors[], warnings[] }`. |
| `importBackup(jsonOrObject, { mode: 'merge' \| 'replace', onDuplicate: 'newest' \| 'overwrite' \| 'skip' })` | Validates everything first, then writes in **one transaction**. Invalid input throws `DataError('VALIDATION', …, errors)` and changes nothing. Returns per-table `inserted / updated / skipped`. |

## iOS Safari / PWA notes

- IndexedDB works in Safari and standalone PWAs. Safari **tabs** may evict script-writable storage after 7 days without use. Home-screen PWAs are exempt, but recommend installing the PWA, calling `requestPersistentStorage()`, and exporting backups regularly.
- Private browsing can make IndexedDB unavailable → `initializeApp()` throws `DataError('UNAVAILABLE')`.
- Barcode lookup and the opt-in AI features are the only network calls; everything else works offline.
