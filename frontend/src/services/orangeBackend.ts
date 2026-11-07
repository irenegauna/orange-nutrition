/**
 * Adapter: implements the UI's `NutritionBackend` interface on top of the real
 * local-first backend in `nutrition_app/` (Dexie/IndexedDB, USDA catalog, Open Food Facts).
 *
 * Rules
 * - No nutrition math here beyond selecting values the backend computed (totals, coverage,
 *   progress, recipe nutrition). Per-serving → per-100 g conversion uses the backend's `scaleValues`.
 * - Missing data stays missing: micronutrients only appear when the backend has data for them.
 * - Every call waits for `initializeApp()` (DB open, migrations, USDA seed).
 */
import * as B from '@backend'
import type { NutritionBackend } from '@/core/services'
import {
  MEAL_TYPES,
  NUTRIENTS,
  type AiStatus,
  type AssistantReply,
  type ChatTurn,
  type DailyInsight,
  type DayStat,
  type DaySummary,
  type Food,
  type FoodSource,
  type Goals,
  type ISODate,
  type LogEntry,
  type Macros,
  type MealSummary,
  type MealType,
  type MicronutrientKey,
  type NutrientCoverage,
  type NutritionValues,
  type Preferences,
  type ProfileInput,
  type ProfileState,
  type Quantity,
  type Recipe,
  type RecipeDraft,
  type RecipeNutrition,
  type Recommendation,
  type Serving,
} from '@/core/types'
import { AR_FRACTION, MIN_COMPLETENESS_FOR_LOW } from '@/components/nutrients/nutrientStatus'

// ── ids & meal types ─────────────────────────────────────────────────────
const MICRO_KEYS = Object.keys(NUTRIENTS) as MicronutrientKey[]
const MACRO_IDS = { calories: 'energy', protein: 'protein', carbs: 'carbohydrate', fat: 'fat', fiber: 'fiber' } as const satisfies Record<
  keyof Macros,
  B.NutrientId
>

const toBMeal = (m: MealType): B.MealType => (m === 'snacks' ? 'snack' : m)
const toUIMeal = (m: B.MealType): MealType => (m === 'snack' ? 'snacks' : m)

// ── initialization ───────────────────────────────────────────────────────
let initPromise: Promise<void> | null = null


function toBackendTargets(g: Goals, origin: 'user' | 'reference'): B.DailyGoals['targets'] {
  const t: B.DailyGoals['targets'] = {}
  const set = (id: B.NutrientId, amount: number, direction: B.TargetDirection) => {
    if (amount > 0) t[id] = { amount, direction, origin, ...(direction === 'around' ? { tolerance: 0.1 } : {}) }
  }
  set('energy', g.calories, 'around')
  set('protein', g.protein, 'atLeast')
  set('carbohydrate', g.carbs, 'around')
  set('fat', g.fat, 'around')
  set('fiber', g.fiber, 'atLeast')
  for (const k of MICRO_KEYS) {
    const v = g.micros[k]
    if (v !== undefined) set(k, v, NUTRIENTS[k].isLimit ? 'atMost' : 'atLeast')
  }
  return t
}

async function ready() {
  initPromise ??= (async () => {
    await B.initializeApp()
    // Fresh install: seed EU/AESAN targets from a past date so every day has goals.
    // No profile yet: EU Reference Intakes + AESAN (backend defaults), from a past date so every day has goals.
    if ((await B.listGoalHistory()).length === 0) await B.setGoals(B.defaultEuTargets(), '2000-01-01')
    // With a profile: keep today's targets in line with it (e.g. a birthday changes the age band).
    await B.refreshTargetsForAge()
  })().catch((e) => {
    initPromise = null
    throw e
  })
  return initPromise
}

/** Wraps every async function of a service so it runs after initialization. */
function initialized<T extends object>(svc: T): T {
  return Object.fromEntries(
    Object.entries(svc).map(([k, fn]) => [k, async (...args: unknown[]) => (await ready(), (fn as (...a: unknown[]) => unknown)(...args))]),
  ) as T
}

// ── value mapping ────────────────────────────────────────────────────────
const amountOf = (v: B.NutrientValue | undefined) => (v && v.status !== 'missing' ? v.amount : 0)

function valuesToUI(v: B.NutrientValues): NutritionValues {
  const micros: NutritionValues['micros'] = {}
  for (const k of MICRO_KEYS) if (B.hasData(v[k])) micros[k] = v[k]!.amount
  return {
    calories: amountOf(v.energy),
    protein: amountOf(v.protein),
    carbs: amountOf(v.carbohydrate),
    fat: amountOf(v.fat),
    fiber: amountOf(v.fiber),
    micros,
  }
}

function totalsToUI(t: B.NutrientTotals): NutritionValues {
  const micros: NutritionValues['micros'] = {}
  for (const k of MICRO_KEYS) if (t[k].coverage.withData > 0) micros[k] = t[k].amount
  return {
    calories: t.energy.amount,
    protein: t.protein.amount,
    carbs: t.carbohydrate.amount,
    fat: t.fat.amount,
    fiber: t.fiber.amount,
    micros,
  }
}

const macrosOfTotals = (t: B.NutrientTotals): Macros => ({
  calories: t.energy.amount,
  protein: t.protein.amount,
  carbs: t.carbohydrate.amount,
  fat: t.fat.amount,
  fiber: t.fiber.amount,
})

const GRAM: Serving = { label: 'g', grams: 1 }

function servingsToUI(servings: B.ServingDefinition[]): Serving[] {
  const sorted = [...servings].sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault))
  return [...sorted.map((s) => ({ id: s.id, label: s.label, grams: s.grams })), GRAM]
}

function toBackendQuantity(q: Quantity): B.Quantity {
  if (q.serving.id) return { amount: q.amount, unit: 'serving', servingId: q.serving.id }
  if (q.serving.grams === 1) return { amount: q.amount, unit: 'g' }
  return { amount: q.amount * q.serving.grams, unit: 'g' } // unit-less serving → grams
}

function quantityToUI(q: B.Quantity, servings: B.ServingDefinition[], grams: number): Quantity {
  if (q.unit === 'serving') {
    const s = servings.find((x) => x.id === q.servingId)
    return { amount: q.amount, serving: s ? { id: s.id, label: s.label, grams: s.grams } : { label: 'serving', grams: grams / (q.amount || 1) } }
  }
  if (q.unit === 'g') return { amount: q.amount, serving: GRAM }
  return { amount: q.amount, serving: { label: q.unit.replace('_', ' '), grams: grams / (q.amount || 1) } }
}

const SOURCE: Record<B.FoodSourceType, FoodSource> = {
  usda_sr_legacy: 'catalog',
  open_food_facts: 'barcode',
  user: 'custom',
  recipe: 'recipe',
}

/** Spanish provenance labels (the stored citation stays in the backend data). */
const ATTRIBUTION_ES: Partial<Record<B.FoodSourceType, string>> = {
  usda_sr_legacy: 'Datos: USDA FoodData Central (SR Legacy)',
  open_food_facts: 'Datos de Open Food Facts (licencia ODbL)',
  user: 'Alimento creado por ti',
  recipe: 'Receta',
}

function foodToUI(f: B.Food, isFavorite: boolean): Food {
  return {
    id: f.id,
    name: f.name,
    brand: f.brand,
    barcode: f.barcode,
    source: SOURCE[f.source.type],
    per100g: valuesToUI(f.nutrientsPer100g),
    servings: servingsToUI(f.servings),
    isFavorite,
    attribution: ATTRIBUTION_ES[f.source.type] ?? f.source.attribution,
    category: f.category,
  }
}

function entryToUI(e: B.MealEntry, foods?: ReadonlyMap<string, B.Food>): LogEntry {
  return {
    category: e.kind === 'recipe' ? 'recipe' : e.foodId ? foods?.get(e.foodId)?.category : undefined,
    id: e.id,
    date: e.date,
    meal: toUIMeal(e.mealType),
    foodId: e.foodId,
    recipeId: e.recipeId,
    name: e.snapshot.name,
    brand: e.snapshot.brand,
    quantity: quantityToUI(e.quantity, e.snapshot.servings, e.grams),
    nutrition: valuesToUI(e.nutrients),
    createdAt: e.createdAt,
  }
}

function goalsToUI(g: B.DailyGoals | null): Goals {
  const t = g?.targets ?? {}
  const micros: Goals['micros'] = {}
  for (const k of MICRO_KEYS) if (t[k]) micros[k] = t[k]!.amount
  return {
    calories: t.energy?.amount ?? 0,
    protein: t.protein?.amount ?? 0,
    carbs: t.carbohydrate?.amount ?? 0,
    fat: t.fat?.amount ?? 0,
    fiber: t.fiber?.amount ?? 0,
    micros,
  }
}

const favoriteIds = async () => new Set((await B.getPreferences()).favoriteFoodIds)

// ── summaries ────────────────────────────────────────────────────────────
async function daySummary(date: ISODate): Promise<DaySummary> {
  const [s, meals] = await Promise.all([B.getDailySummary(date), B.getDailyMeals(date)])
  const foods = await B.getFoods([...new Set(Object.values(meals).flat().flatMap((e) => (e.foodId ? [e.foodId] : [])))])
  const remaining = Object.fromEntries(
    (Object.keys(MACRO_IDS) as (keyof Macros)[]).map((k) => {
      const id = MACRO_IDS[k]
      return [k, s.progress[id]?.remaining ?? -s.totals[id].amount]
    }),
  ) as unknown as Macros
  return {
    date,
    goals: goalsToUI(s.goals),
    totals: totalsToUI(s.totals),
    remaining,
    entryCount: s.entryCount,
    meals: Object.fromEntries(
      MEAL_TYPES.map((m): [MealType, MealSummary] => {
        const bm = toBMeal(m)
        return [m, { meal: m, entries: meals[bm].map((e) => entryToUI(e, foods)), totals: macrosOfTotals(s.byMeal[bm].totals) }]
      }),
    ) as Record<MealType, MealSummary>,
  }
}

function coverageFor(key: MicronutrientKey, s: B.DailyNutritionSummary, entries: B.MealEntry[]): NutrientCoverage {
  const t = s.totals[key]
  const target = s.goals?.targets[key]?.amount ?? null
  const byName = new Map<string, number>()
  for (const e of entries) {
    const v = e.nutrients[key]
    if (B.hasData(v) && v.amount > 0) byName.set(e.snapshot.name, (byName.get(e.snapshot.name) ?? 0) + v.amount)
  }
  return {
    key,
    intake: t.amount,
    target,
    percentOfTarget: s.progress[key]?.percent ?? null,
    // Backend coverage is mass-weighted: share of eaten grams that had data for this nutrient.
    completeness: t.coverage.contributors ? t.coverage.ratio : 0,
    reportingEntries: t.coverage.withData,
    totalEntries: t.coverage.contributors,
    contributors: [...byName.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, amount]) => ({ name, amount })),
  }
}

async function richFoods(key: MicronutrientKey, date: ISODate, limit = 4): Promise<Food[]> {
  try {
    const recs = await B.recommend({ intent: 'micronutrient', nutrientId: key, date, limit: limit * 2 })
    const ids = [...new Set(recs.flatMap((r) => (r.kind === 'food' ? r.ingredients.map((i) => i.foodId) : [])))].slice(0, limit)
    const [foods, fav] = await Promise.all([B.getFoods(ids), favoriteIds()])
    return ids.map((id) => foods.get(id)).filter((f): f is B.Food => !!f).map((f) => foodToUI(f, fav.has(f.id)))
  } catch {
    return []
  }
}

// ── recipes ──────────────────────────────────────────────────────────────
function recipeNutritionToUI(n: B.RecipeNutrition): RecipeNutrition {
  return { total: totalsToUI(n.total), perServing: totalsToUI(n.perServing), totalGrams: n.totalGrams }
}

async function recipeToUI(r: B.Recipe): Promise<Recipe> {
  const n = await B.getRecipeNutrition(r)
  return {
    id: r.id,
    name: r.name,
    servings: r.servings,
    ingredients: r.ingredients.map((i) => ({
      foodId: i.foodId,
      foodName: i.snapshot.name,
      quantity: quantityToUI(i.quantity, i.snapshot.servings, i.grams),
    })),
    nutrition: recipeNutritionToUI(n),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

// ── recommendations ──────────────────────────────────────────────────────
const recCache = new Map<string, B.Recommendation>()

function recToUI(r: B.Recommendation): Recommendation {
  recCache.set(r.id, r)
  return {
    id: r.id,
    name: r.name,
    ingredients: r.ingredients.map((i) => ({ name: i.name, amount: i.quantityLabel, foodId: i.foodId })),
    nutrition: macrosOfTotals(r.nutrition),
    prepMinutes: r.prepTimeMinutes,
    explanation: r.explanation.join(' '),
    tags: [r.kind, ...(r.source ? [r.source] : [])],
    suggestedMeal: r.mealType ? toUIMeal(r.mealType) : undefined,
  }
}

const SUGGESTED_PROMPTS = [
  '¿Qué ceno hoy?',
  'Necesito más proteína.',
  'Sugiéreme algo de menos de 400 calorías.',
  '¿Qué puedo hacer con huevos y espinacas?',
  '¿Cómo puedo tomar más fibra?',
  '¿Qué nutrientes me han faltado esta semana?',
]

let seq = 0
const reply = (text: string, recs: Recommendation[] = [], followUps?: string[]): AssistantReply => ({
  id: `r${Date.now()}-${seq++}`,
  text,
  recommendations: recs,
  followUps,
})
const n0 = (n: number) => Math.round(n).toLocaleString('es-ES')
/** "Vitamina A" → "vitamina A" (lowercase only the first letter, keep "A", "B12"…). */
const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase('es-ES') + s.slice(1)
const upperFirst = (s: string) => s.charAt(0).toLocaleUpperCase('es-ES') + s.slice(1)
/** "Ideas para …" per meal. */
const MEAL_IDEAS_FOR: Record<MealType, string> = { breakfast: 'el desayuno', lunch: 'la comida', dinner: 'la cena', snacks: 'picar' }

async function weeklyNutrientGaps(date: ISODate): Promise<AssistantReply> {
  const [period, goals] = await Promise.all([B.getPeriodSummary(date, 7), B.getGoals(date)])
  if (period.loggedDays === 0) return reply('No has registrado nada en los últimos 7 días, así que aún no hay nada que comparar.')
  const low: { key: MicronutrientKey; pct: number }[] = []
  const unknown: string[] = []
  for (const k of MICRO_KEYS) {
    const target = goals?.targets[k]
    if (!target || NUTRIENTS[k].isLimit) continue
    const avg = period.averages[k]
    if (avg.coverage.contributors === 0 || avg.coverage.ratio < MIN_COMPLETENESS_FOR_LOW) {
      unknown.push(NUTRIENTS[k].label)
      continue
    }
    const pct = (avg.amount / target.amount) * 100
    if (pct < AR_FRACTION * 100) low.push({ key: k, pct })
  }
  low.sort((a, b) => a.pct - b.pct)
  const days = `${period.loggedDays} día${period.loggedDays > 1 ? 's' : ''} registrado${period.loggedDays > 1 ? 's' : ''}`
  const parts = [
    low.length
      ? `En ${period.loggedDays > 1 ? 'los últimos' : 'el último'} ${days}, estos nutrientes han quedado de media bastante por debajo de las ingestas de referencia españolas (AESAN): ${low
          .slice(0, 4)
          .map((l) => `${NUTRIENTS[l.key].label} (~${Math.round(l.pct)}%)`)
          .join(', ')}.`
      : `En ${period.loggedDays > 1 ? 'los últimos' : 'el último'} ${days}, ninguno de los nutrientes con datos suficientes ha quedado de media claramente por debajo de la referencia.`,
  ]
  if (unknown.length)
    parts.push(
      `Faltan demasiados datos para valorar ${unknown.slice(0, 5).map(lowerFirst).join(', ')}${unknown.length > 5 ? ' y otros' : ''}: son datos que faltan, no necesariamente una ingesta baja.`,
    )
  const recs = low[0] ? (await B.recommend({ intent: 'micronutrient', nutrientId: low[0].key, date, limit: 3 })).map(recToUI) : []
  if (recs.length) parts.push(`Algunos alimentos ricos en ${lowerFirst(NUTRIENTS[low[0]!.key].label)}:`)
  return reply(parts.join(' '), recs)
}

const AI_ERROR_TEXT: Record<string, string> = {
  RATE_LIMITED: 'se ha alcanzado el límite gratuito de Gemini (5 peticiones por minuto); espera un minuto y vuelve a intentarlo',
  OVERLOADED: 'Gemini está muy saturado ahora mismo; inténtalo de nuevo en un momento',
  MODEL_NOT_FOUND: 'el modelo de Gemini seleccionado no está disponible para tu clave',
  INVALID_KEY: 'Gemini ha rechazado tu clave de API; revísala en Ajustes',
  PERMISSION_DENIED: 'Gemini ha rechazado la petición; revisa tu clave de API en Ajustes',
  OFFLINE: 'no tienes conexión',
  TIMEOUT: 'Gemini ha tardado demasiado en responder',
  NETWORK: 'no se ha podido conectar con Gemini',
  BLOCKED: 'Gemini ha preferido no responder a eso',
}

/** Gemini first (when enabled), rule engine as fallback. */
async function ask(message: string, date: ISODate, history: ChatTurn[] = []): Promise<AssistantReply> {
  const ai = await B.getAiSettingsPublic()
  if (ai.aiSuggestionsAvailable) {
    try {
      const r = await B.chatWithAssistant({ message, history, date })
      return { ...reply(r.text, r.recommendations.map(recToUI), r.followUps.length ? r.followUps : undefined), source: 'ai' }
    } catch (e) {
      const code = e instanceof B.DataError ? ((e.details as { code?: string } | undefined)?.code ?? '') : ''
      const why = AI_ERROR_TEXT[code] ?? 'no se ha podido usar la respuesta de la IA'
      const fallback = await askRules(message, date)
      return { ...fallback, source: 'rules', notice: `Ha respondido el motor integrado porque ${why}.` }
    }
  }
  return { ...(await askRules(message, date)), source: 'rules' }
}

async function askRules(message: string, date: ISODate): Promise<AssistantReply> {
  // Weekly nutrient gaps (Spanish first; English kept). Accents are stripped before matching.
  const plain = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (
    /(me (han|ha) faltado|me faltan?|faltad[oa]s?|carencias?|deficit|(he|hemos) tomado (poco|menos)|bajos? en).*(semana|nutrientes?|vitaminas?|minerales?)/i.test(plain) ||
    /(nutrientes?|vitaminas?|minerales?).*(esta semana|la semana|semanal|me (han|ha) faltado|me faltan?|faltan?)/i.test(plain) ||
    /(less of|lowest|low in|lacking|short on).*(week|nutrient)|nutrients?.*(this week|week)/i.test(plain)
  )
    return weeklyNutrientGaps(date)

  const [res, summary] = await Promise.all([B.recommendFromText(message, { date, limit: 3 }), B.getDailySummary(date)])
  const recs = res.recommendations.map(recToUI)
  const { request, confidence } = res.parsed
  const remaining = (id: B.NutrientId) => summary.progress[id]?.remaining

  if (confidence < 0.2 && recs.length === 0) {
    return reply(
      'Soy un asistente basado en reglas, no un chatbot. Puedo sugerirte desayunos, comidas, cenas o snacks, opciones por debajo de un límite de calorías, ideas ricas en proteína o en fibra, platos con los ingredientes que me digas, alimentos ricos en un nutriente o repasar qué nutrientes te han faltado esta semana.',
      [],
      SUGGESTED_PROMPTS.slice(0, 3),
    )
  }
  if (recs.length === 0) {
    return reply(
      'No he encontrado sugerencias que encajen con lo que pides y, a la vez, con tu dieta, tus alergias y lo que no te gusta. Prueba a relajar algún límite o a nombrar otros ingredientes.',
    )
  }

  let lead: string
  switch (request.intent) {
    case 'high_protein': {
      const r = remaining('protein')
      lead = r !== undefined ? (r > 0 ? `Hoy te quedan ${n0(r)} g de proteína. Estas opciones son ricas en proteína:` : 'Ya has cumplido tu objetivo de proteína de hoy. Aun así, estas opciones son ricas en proteína:') : 'Estas opciones son ricas en proteína:'
      break
    }
    case 'high_fiber': {
      const r = remaining('fiber')
      lead = r !== undefined && r > 0 ? `Te faltan ${n0(r)} g para tu objetivo de fibra de hoy. Lo que más ayuda: legumbres, cereales integrales, verdura y fruta:` : 'Ideas ricas en fibra:'
      break
    }
    case 'low_calorie':
      lead = request.maxCalories ? `Opciones de menos de ${n0(request.maxCalories)} kcal:` : 'Opciones más ligeras:'
      break
    case 'use_ingredients':
      lead = res.matchedIngredients.length ? `Ideas con ${res.matchedIngredients.map((f) => f.name).join(', ')}:` : 'Ideas con lo que tienes:'
      break
    case 'micronutrient':
      lead = request.nutrientId ? `Alimentos ricos en ${NUTRIENTS[request.nutrientId as MicronutrientKey] ? lowerFirst(NUTRIENTS[request.nutrientId as MicronutrientKey].label) : request.nutrientId}:` : 'Ideas ricas en nutrientes:'
      break
    case 'fit_remaining': {
      const r = summary.remainingCalories
      lead = r !== null ? `Encajan con las ~${n0(Math.max(r, 0))} kcal que te quedan hoy:` : 'Encajan con lo que te queda para tus objetivos:'
      break
    }
    default: {
      const r = summary.remainingCalories
      const meal = request.mealType ? toUIMeal(request.mealType) : null
      lead = `${meal ? `Ideas para ${MEAL_IDEAS_FOR[meal]}` : 'Ideas'}${r !== null && r > 0 ? ` con las ~${n0(r)} kcal que te quedan` : ''}:`
    }
  }
  if (res.unmatchedTerms.length) lead += ` (No he encontrado «${res.unmatchedTerms.join('», «')}» en la base de datos de alimentos).`
  return reply(lead, recs)
}

function insightsFor(day: DaySummary, isToday: boolean): DailyInsight[] {
  const out: DailyInsight[] = []
  const { remaining, goals } = day
  if (day.entryCount === 0) {
    out.push({
      id: 'empty',
      kind: 'general',
      title: isToday ? 'Aún no has registrado nada' : 'Sin registros este día',
      message: isToday
        ? `Tus objetivos de hoy: ${n0(goals.calories)} kcal y al menos ${n0(goals.protein)} g de proteína.`
        : 'Lo que registres este día aparecerá aquí.',
      action: isToday ? { label: 'Ideas de comidas', prompt: '¿Qué puedo comer?' } : undefined,
    })
    return out
  }
  const hour = new Date().getHours()
  if (goals.protein > 0 && remaining.protein >= 15) {
    const next = !isToday ? 'Ideas de comidas' : hour < 11 ? 'Ideas para comer' : hour < 17 ? 'Ideas para cenar' : 'Ideas para picar'
    out.push({
      id: 'protein',
      kind: 'protein',
      title: 'Proteínas',
      message: `${isToday ? 'Hoy te quedan' : 'Te quedan'} ${n0(remaining.protein)} g de proteína.`,
      action: { label: next, prompt: 'Necesito más proteína.' },
    })
  }
  if (goals.fiber > 0 && remaining.fiber >= 8 && (hour >= 14 || !isToday)) {
    out.push({
      id: 'fiber',
      kind: 'fiber',
      title: 'Fibra',
      message: `Llevas ${n0(day.totals.fiber)} de ${n0(goals.fiber)} g de fibra.`,
      action: { label: 'Ideas con fibra', prompt: '¿Cómo puedo tomar más fibra?' },
    })
  }
  if (goals.calories > 0 && remaining.calories < -goals.calories * 0.1) {
    out.push({ id: 'over', kind: 'calories', title: 'Calorías', message: `Te has pasado ${n0(-remaining.calories)} kcal de tu objetivo.` })
  }
  return out
}

// ── UI-only preferences (not part of the backend model) ─────────────────
const UI_PREFS_KEY = 'orange-ui-prefs'
type UiPrefs = Pick<Preferences, 'theme' | 'displayName'>
const readUiPrefs = (): UiPrefs => {
  try {
    return { theme: 'system', ...JSON.parse(localStorage.getItem(UI_PREFS_KEY) ?? '{}') }
  } catch {
    return { theme: 'system' }
  }
}
const writeUiPrefs = (p: UiPrefs) => {
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

const DIET_TO_B: Record<string, B.DietType> = {
  vegetarian: 'vegetarian',
  vegan: 'vegan',
  pescatarian: 'pescatarian',
  'gluten-free': 'gluten_free',
  'dairy-free': 'dairy_free',
}
const DIET_TO_UI = Object.fromEntries(Object.entries(DIET_TO_B).map(([k, v]) => [v, k])) as Record<B.DietType, string>

// ── the backend ──────────────────────────────────────────────────────────
function aiStatus(s: B.AiSettingsPublic): AiStatus {
  return {
    hasApiKey: s.hasApiKey,
    apiKeyHint: s.apiKeyHint,
    consentAccepted: !!s.consentAcceptedAt,
    assistantEnabled: s.aiSuggestionsEnabled,
    assistantAvailable: s.aiSuggestionsAvailable,
    photoEnabled: s.photoRecognitionEnabled,
    photoAvailable: s.photoRecognitionAvailable,
    model: s.model,
    privacyNotice: B.AI_PRIVACY_NOTICE,
  }
}

const aiErrorMessage = (e: unknown, action: string) => {
  const code = e instanceof B.DataError ? ((e.details as { code?: string } | undefined)?.code ?? '') : ''
  return new Error(`${action}: ${AI_ERROR_TEXT[code] ?? (e instanceof Error ? e.message : 'algo ha ido mal')}.`)
}

const photoService = initialized({
  async analyze(image: Blob, { meal, hint }: { meal: MealType; hint?: string }) {
    let r: B.PhotoRecognitionResult
    try {
      r = await B.recognizeMealPhoto(image, { mealType: toBMeal(meal), ...(hint?.trim() ? { hint: hint.trim() } : {}) })
    } catch (e) {
      throw aiErrorMessage(e, 'No se ha podido analizar la foto')
    }
    return {
      isFood: r.isFood,
      description: r.description,
      photoId: r.photoId,
      model: r.model,
      items: r.items.map((i) => ({
        id: i.id,
        name: i.detected.name,
        estimatedGrams: i.detected.estimatedGrams,
        confidence: i.detected.confidence,
        preparation: i.detected.preparation,
        matches: i.matches.map((m) => foodToUI(m.food, m.isFavorite)),
        selectedFoodId: i.selectedFoodId,
      })),
    }
  },
  async rematch(name: string) {
    const results = await B.matchDetectedFood({ name, searchTerms: [name], estimatedGrams: 100, confidence: 1 })
    return results.map((m) => foodToUI(m.food, m.isFavorite))
  },
  async totals(items: { foodId: string; grams: number }[]) {
    const foods = await B.getFoods(items.map((i) => i.foodId))
    const agg = items.flatMap((i) => {
      const f = foods.get(i.foodId)
      return f && i.grams > 0 ? [{ grams: i.grams, nutrients: B.nutrientsForGrams(f, i.grams) }] : []
    })
    return macrosOfTotals(B.sumNutrients(agg))
  },
  async log({ date, meal, photoId, items }: { date: ISODate; meal: MealType; photoId?: string; items: { foodId: string; grams: number }[] }) {
    const entries = await B.logPhotoMeal({ date, mealType: toBMeal(meal), items, ...(photoId ? { photoId } : {}) })
    return entries.map((e) => entryToUI(e))
  },
  async discard(photoId: string) {
    await B.deletePhoto(photoId)
  },
})

function profileToUI(r: B.ProfileWithTargets): ProfileState {
  const { profile: p, age, personal } = r
  const b = personal.breakdown
  return {
    profile: { sex: p.sex, age, heightCm: p.heightCm, weightKg: p.weightKg, activity: p.activity, objective: p.objective },
    targets: goalsToUI({ id: 'calculated', effectiveFrom: B.today(), targets: personal.targets, createdAt: '', updatedAt: '' }),
    breakdown: { ...b, warnings: [...b.warnings], sources: [...b.sources] },
  }
}

const profileService = initialized({
  async get() {
    const r = await B.getProfileWithTargets()
    return r ? profileToUI(r) : null
  },
  async save(input: ProfileInput) {
    try {
      return profileToUI(await B.saveProfile(input))
    } catch (e) {
      if (e instanceof B.DataError && Array.isArray(e.details) && e.details.length) throw new Error(String(e.details[0]).replace(/^[a-zA-Z]+: /, ''))
      throw e
    }
  },
})

const aiService = initialized({
  async status() {
    return aiStatus(await B.getAiSettingsPublic())
  },
  async setApiKey(key: string | null) {
    return aiStatus(await B.setAiApiKey(key))
  },
  async acceptPrivacyNotice() {
    return aiStatus(await B.acceptAiPrivacyNotice())
  },
  async revokeConsent(forgetKey?: boolean) {
    return aiStatus(await B.revokeAiConsent(forgetKey))
  },
  async setAssistantEnabled(enabled: boolean) {
    return aiStatus(await B.updateAiSettings({ aiSuggestionsEnabled: enabled }))
  },
  async setPhotoEnabled(enabled: boolean) {
    return aiStatus(await B.updateAiSettings({ photoRecognitionEnabled: enabled }))
  },
  async test() {
    const r = await B.testAiConnection()
    return r.ok ? { ok: true, message: `Conectado a ${r.model}` } : { ok: false, message: AI_ERROR_TEXT[r.code] ? upperFirst(AI_ERROR_TEXT[r.code]) : r.message }
  },
})

export const orangeBackend: NutritionBackend = {
  ai: aiService,
  profile: profileService,
  photo: photoService,
  foods: initialized({
    async search(query: string) {
      if (!query.trim()) return []
      return (await B.searchFoods(query, { limit: 30 })).map((r) => foodToUI(r.food, r.isFavorite))
    },
    async get(id: string) {
      const [f, fav] = await Promise.all([B.getFood(id), favoriteIds()])
      return f ? foodToUI(f, fav.has(f.id)) : null
    },
    async recent(limit = 8) {
      const fav = await favoriteIds()
      return (await B.getRecentFoods(limit)).flatMap((r) => (r.food ? [foodToUI(r.food, fav.has(r.food.id))] : []))
    },
    async favorites() {
      return (await B.getFavoriteFoods()).map((f) => foodToUI(f, true))
    },
    async setFavorite(id: string, favorite: boolean) {
      await B.setFoodFavorite(id, favorite)
    },
    async createCustom(input) {
      const per: B.NutrientValues = {}
      const put = (id: B.NutrientId, v: number | undefined) => {
        if (v === undefined) return
        per[id] = v === 0 ? { status: 'zero', amount: 0 } : { status: 'known', amount: v }
      }
      put('energy', input.perServing.calories)
      put('protein', input.perServing.protein)
      put('carbohydrate', input.perServing.carbs)
      put('fat', input.perServing.fat)
      put('fiber', input.perServing.fiber)
      for (const k of MICRO_KEYS) put(k, input.perServing.micros[k])
      const food: Omit<B.CustomFoodInput, 'barcode'> = {
        name: input.name,
        ...(input.brand ? { brand: input.brand } : {}),
        nutrientsPer100g: B.scaleValues(per, 100 / input.serving.grams),
        servings: [{ label: input.serving.label, grams: input.serving.grams, isDefault: true }],
      }
      const created = input.barcode ? await B.createFoodForBarcode(input.barcode, food) : await B.createCustomFood(food)
      return foodToUI(created, false)
    },
    async preview(foodId: string, quantity: Quantity) {
      const f = await B.getFood(foodId)
      if (!f) throw new Error('Alimento no encontrado')
      return valuesToUI(B.nutrientsForQuantity(f, toBackendQuantity(quantity)).nutrients)
    },
  }),

  barcode: initialized({
    async lookup(code: string) {
      const r = await B.lookupBarcode(code)
      switch (r.status) {
        case 'found':
          return { status: 'found' as const, food: foodToUI(r.food, (await favoriteIds()).has(r.food.id)) }
        case 'not_found':
          return { status: 'not_found' as const, barcode: r.barcode }
        case 'invalid':
          return { status: 'error' as const, barcode: r.barcode, message: 'No parece un código de barras EAN/UPC válido. Revisa los dígitos.' }
        default:
          return {
            status: 'error' as const,
            barcode: r.barcode,
            message: r.code === 'OFFLINE' ? 'No tienes conexión. Conéctate para buscar productos nuevos o añádelo a mano.' : r.message,
          }
      }
    },
  }),

  diary: initialized({
    async addEntry({ date, meal, foodId, quantity }) {
      return entryToUI(await B.addMealEntry({ date, mealType: toBMeal(meal), foodId, quantity: toBackendQuantity(quantity) }))
    },
    async updateEntry(id: string, patch: { meal?: MealType; quantity?: Quantity }) {
      return entryToUI(
        await B.updateMealEntry(id, {
          ...(patch.meal ? { mealType: toBMeal(patch.meal) } : {}),
          ...(patch.quantity ? { quantity: toBackendQuantity(patch.quantity) } : {}),
        }),
      )
    },
    async deleteEntry(id: string) {
      await B.deleteMealEntry(id)
    },
    async logRecipe({ date, meal, recipeId, servings }) {
      return entryToUI(await B.logRecipe(recipeId, { date, mealType: toBMeal(meal), servings }))
    },
    async logRecommendation({ date, meal, recommendation }) {
      const r = recCache.get(recommendation.id)
      if (!r) throw new Error('Esta sugerencia ha caducado. Vuelve a preguntar para actualizarla.')
      if (r.kind === 'recipe' && r.recipeId) return entryToUI(await B.logRecipe(r.recipeId, { date, mealType: toBMeal(meal) }))
      // Plates/foods: log each ingredient at the suggested grams (nutrition computed by the backend).
      const entries: B.MealEntry[] = []
      for (const i of r.ingredients) {
        entries.push(
          await B.addMealEntry({ date, mealType: toBMeal(meal), foodId: i.foodId, quantity: { amount: i.grams, unit: 'g' }, origin: 'suggestion' }),
        )
      }
      return entryToUI(entries[0]!)
    },
  }),

  summaries: initialized({
    getDay: daySummary,
    async getNutrients(date: ISODate) {
      const [s, meals] = await Promise.all([B.getDailySummary(date), B.getDailyMeals(date)])
      const entries = Object.values(meals).flat()
      return { date, entryCount: s.entryCount, nutrients: MICRO_KEYS.map((k) => coverageFor(k, s, entries)) }
    },
    async getNutrientDetail(date: ISODate, key: MicronutrientKey) {
      const [s, meals] = await Promise.all([B.getDailySummary(date), B.getDailyMeals(date)])
      const coverage = coverageFor(key, s, Object.values(meals).flat())
      return { coverage, info: NUTRIENTS[key], suggestions: NUTRIENTS[key].isLimit ? [] : await richFoods(key, date) }
    },
  }),

  recipes: initialized({
    async list() {
      const rs = await B.listRecipes()
      return Promise.all([...rs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(recipeToUI))
    },
    async get(id: string) {
      const r = await B.getRecipe(id)
      return r ? recipeToUI(r) : null
    },
    async calculate(draft: RecipeDraft) {
      const foods = await B.getFoods(draft.ingredients.map((i) => i.foodId))
      const ingredients: B.RecipeIngredient[] = draft.ingredients.flatMap((ing, i) => {
        const f = foods.get(ing.foodId)
        return f ? [{ id: `draft_${i}`, foodId: f.id, quantity: toBackendQuantity(ing.quantity), grams: 0, snapshot: B.snapshotOf(f) }] : []
      })
      return recipeNutritionToUI(B.calculateRecipeNutrition({ id: 'draft', servings: Math.max(draft.servings, 1), ingredients }, foods))
    },
    async save(draft: RecipeDraft) {
      const ingredients = draft.ingredients.map((i) => ({ foodId: i.foodId, quantity: toBackendQuantity(i.quantity) }))
      let saved: B.Recipe
      if (draft.id) {
        await B.updateRecipe(draft.id, { name: draft.name, servings: draft.servings })
        const existing = await B.getRecipe(draft.id)
        for (const ing of existing?.ingredients ?? []) await B.removeIngredient(draft.id, ing.id)
        for (const ing of ingredients) await B.addIngredient(draft.id, ing)
        saved = (await B.getRecipe(draft.id))!
      } else {
        saved = await B.createRecipe({ name: draft.name, servings: draft.servings, ingredients })
      }
      return recipeToUI(saved)
    },
    async delete(id: string) {
      await B.deleteRecipe(id)
    },
  }),

  recommendations: initialized({
    async ask(message: string, { date, history }: { date: ISODate; history?: ChatTurn[] }) {
      return ask(message, date, history)
    },
    async getDailyInsights(date: ISODate) {
      return insightsFor(await daySummary(date), date === B.today())
    },
    async suggestedPrompts() {
      return SUGGESTED_PROMPTS
    },
  }),

  history: initialized({
    async getRange(start: ISODate, end: ISODate) {
      const days = await B.getDailySummaries(start, end)
      const period = B.buildPeriodSummary(days)
      const stats: DayStat[] = days.map((d) => {
        const logged = d.entryCount > 0
        const energy = d.progress.energy?.status
        return {
          date: d.date,
          logged,
          totals: macrosOfTotals(d.totals),
          micros: totalsToUI(d.totals).micros,
          targets: (({ micros: _m, ...m }) => m)(goalsToUI(d.goals)),
          adherence: !logged || !energy ? 'none' : energy === 'met' ? 'within' : energy,
        }
      })
      return {
        start,
        end,
        days: stats,
        averages: macrosOfTotals(period.averages),
        daysLogged: period.loggedDays,
        daysWithinCalorieGoal: period.adherence.energy?.daysMet ?? 0,
        daysMeetingProtein: period.adherence.protein?.daysMet ?? 0,
        daysMeetingFiber: period.adherence.fiber?.daysMet ?? 0,
      }
    },
  }),

  goals: initialized({
    async get() {
      return goalsToUI(await B.getGoals())
    },
    async update(goals: Goals) {
      await B.setGoals(toBackendTargets(goals, 'user'))
      return goals
    },
  }),

  preferences: initialized({
    async get(): Promise<Preferences> {
      const p = await B.getPreferences()
      return {
        dietary: p.diets.map((d) => DIET_TO_UI[d]),
        allergies: [...p.allergies],
        dislikedFoods: [...p.dislikedKeywords],
        ...readUiPrefs(),
      }
    },
    async update(prefs: Preferences) {
      await B.updatePreferences({
        diets: prefs.dietary.flatMap((d) => (DIET_TO_B[d] ? [DIET_TO_B[d]] : [])),
        allergies: prefs.allergies as B.Allergen[],
        dislikedKeywords: prefs.dislikedFoods,
      })
      writeUiPrefs({ theme: prefs.theme, displayName: prefs.displayName })
      return prefs
    },
  }),

  backup: initialized({
    async export() {
      return B.exportBackupJson()
    },
    async validate(file: unknown) {
      const v = B.validateBackup(file)
      return {
        ok: v.valid,
        error: v.errors.slice(0, 3).join('; ') || undefined,
        summary: v.payload
          ? {
              entries: v.payload.data.mealEntries.length,
              foods: v.payload.data.foods.length,
              recipes: v.payload.data.recipes.length,
              exportedAt: v.payload.exportedAt,
            }
          : undefined,
      }
    },
    async import(file: unknown) {
      await B.importBackup(file, { mode: 'replace' })
    },
  }),
}

/** Ask the browser to keep IndexedDB data (iOS evicts tab storage after 7 days idle). */
export const requestPersistentStorage = () => B.requestPersistentStorage().catch(() => false)
