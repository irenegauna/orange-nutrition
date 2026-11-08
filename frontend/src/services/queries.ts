/** TanStack Query bindings over the service adapter. UI code imports from here. */
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type {
  AiStatus,
  ProfileInput,
  ChatTurn,
  CustomFoodInput,
  Goals,
  ISODate,
  MealType,
  MicronutrientKey,
  Preferences,
  Quantity,
  RecipeDraft,
  Recommendation,
} from '@/core/types'
import { api } from './index'

export const qk = {
  day: (d: ISODate) => ['day', d] as const,
  nutrients: (d: ISODate) => ['nutrients', d] as const,
  nutrientDetail: (d: ISODate, k: MicronutrientKey) => ['nutrients', d, k] as const,
  insights: (d: ISODate) => ['insights', d] as const,
  history: (s: ISODate, e: ISODate) => ['history', s, e] as const,
  search: (q: string) => ['foods', 'search', q] as const,
  food: (id: string) => ['foods', 'item', id] as const,
  recent: ['foods', 'recent'] as const,
  favorites: ['foods', 'favorites'] as const,
  recipes: ['recipes'] as const,
  goals: ['goals'] as const,
  prefs: ['prefs'] as const,
  prompts: ['prompts'] as const,
  ai: ['ai'] as const,
}

/** Anything derived from diary contents. */
const invalidateDiary = (qc: QueryClient) =>
  Promise.all(
    ['day', 'nutrients', 'insights', 'history'].map((k) => qc.invalidateQueries({ queryKey: [k] })).concat(
      qc.invalidateQueries({ queryKey: qk.recent }),
    ),
  )

// ── Queries ──────────────────────────────────────────────────────────────
export const useDaySummary = (date: ISODate) =>
  useQuery({ queryKey: qk.day(date), queryFn: () => api.summaries.getDay(date), placeholderData: keepPreviousData })

export const useNutrientReport = (date: ISODate) =>
  useQuery({ queryKey: qk.nutrients(date), queryFn: () => api.summaries.getNutrients(date), placeholderData: keepPreviousData })

export const useNutrientDetail = (date: ISODate, key: MicronutrientKey | null) =>
  useQuery({
    queryKey: key ? qk.nutrientDetail(date, key) : ['nutrients', date, 'none'],
    queryFn: () => api.summaries.getNutrientDetail(date, key!),
    enabled: !!key,
  })

export const useDailyInsights = (date: ISODate) =>
  useQuery({ queryKey: qk.insights(date), queryFn: () => api.recommendations.getDailyInsights(date) })

export const useHistory = (start: ISODate, end: ISODate) =>
  useQuery({ queryKey: qk.history(start, end), queryFn: () => api.history.getRange(start, end), placeholderData: keepPreviousData })

export const useFoodSearch = (q: string) =>
  useQuery({ queryKey: qk.search(q), queryFn: () => api.foods.search(q), enabled: q.trim().length > 0, placeholderData: keepPreviousData })

export const useFood = (id: string | null) =>
  useQuery({ queryKey: qk.food(id ?? ''), queryFn: () => api.foods.get(id!), enabled: !!id })

export const useFoodPreview = (foodId: string | null, quantity: Quantity) =>
  useQuery({
    queryKey: ['foods', 'preview', foodId, quantity.amount, quantity.serving.label, quantity.serving.grams],
    queryFn: () => api.foods.preview(foodId!, quantity),
    enabled: !!foodId && quantity.amount > 0,
    placeholderData: keepPreviousData,
  })

export const useRecentFoods = () => useQuery({ queryKey: qk.recent, queryFn: () => api.foods.recent(8) })
export const useFavoriteFoods = () => useQuery({ queryKey: qk.favorites, queryFn: () => api.foods.favorites() })
export const useRecipes = () => useQuery({ queryKey: qk.recipes, queryFn: () => api.recipes.list() })
export const useGoals = () => useQuery({ queryKey: qk.goals, queryFn: () => api.goals.get() })
export const usePreferences = () => useQuery({ queryKey: qk.prefs, queryFn: () => api.preferences.get() })
export const useSuggestedPrompts = () =>
  useQuery({ queryKey: qk.prompts, queryFn: () => api.recommendations.suggestedPrompts(), staleTime: Infinity })

export const useRecipeCalculation = (draft: RecipeDraft) =>
  useQuery({
    queryKey: ['recipes', 'calc', JSON.stringify(draft)],
    queryFn: () => api.recipes.calculate(draft),
    placeholderData: keepPreviousData,
  })

// ── Mutations ────────────────────────────────────────────────────────────
export function useAddEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.diary.addEntry,
    onSuccess: () => invalidateDiary(qc),
  })
}

export function useUpdateEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; meal?: MealType; quantity?: Quantity }) =>
      api.diary.updateEntry(v.id, { meal: v.meal, quantity: v.quantity }),
    onSuccess: () => invalidateDiary(qc),
  })
}

export function useDeleteEntry() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.diary.deleteEntry(id), onSuccess: () => invalidateDiary(qc) })
}

export function useLogRecipe() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: api.diary.logRecipe, onSuccess: () => invalidateDiary(qc) })
}

export function useLogRecommendation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { date: ISODate; meal: MealType; recommendation: Recommendation }) => api.diary.logRecommendation(v),
    onSuccess: () => invalidateDiary(qc),
  })
}

export function useSetFavorite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { id: string; favorite: boolean }) => api.foods.setFavorite(v.id, v.favorite),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['foods'] }),
  })
}

export function useCreateCustomFood() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CustomFoodInput) => api.foods.createCustom(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['foods'] }),
  })
}

export function useSaveRecipe() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (d: RecipeDraft) => api.recipes.save(d), onSuccess: () => qc.invalidateQueries({ queryKey: qk.recipes }) })
}

export function useDeleteRecipe() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (id: string) => api.recipes.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: qk.recipes }) })
}

export function useUpdateGoals() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (g: Goals) => api.goals.update(g),
    onSuccess: () => qc.invalidateQueries(),
  })
}

export function useUpdatePreferences() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Preferences) => api.preferences.update(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.prefs }),
  })
}

export function useAsk() {
  return useMutation({
    mutationFn: (v: { message: string; date: ISODate; history?: ChatTurn[] }) => api.recommendations.ask(v.message, { date: v.date, history: v.history }),
  })
}

// ── AI (Gemini) ──────────────────────────────────────────────────────────
// ── Profile → calculated targets ─────────────────────────────────────────
export const useProfile = () => useQuery({ queryKey: ['profile'], queryFn: () => api.profile.get() })
export function useSaveProfile() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (p: ProfileInput) => api.profile.save(p), onSuccess: () => qc.invalidateQueries() })
}

export const useAiStatus = () => useQuery({ queryKey: qk.ai, queryFn: () => api.ai.status() })

function useAiMutation<V>(fn: (v: V) => Promise<AiStatus>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: (status) => qc.setQueryData(qk.ai, status) })
}
export const useSetAiKey = () => useAiMutation((key: string | null) => api.ai.setApiKey(key))
export const useAcceptAiNotice = () => useAiMutation((_: void) => api.ai.acceptPrivacyNotice())
export const useRevokeAi = () => useAiMutation((forgetKey: boolean) => api.ai.revokeConsent(forgetKey))
export const useSetAssistantEnabled = () => useAiMutation((enabled: boolean) => api.ai.setAssistantEnabled(enabled))
export const useSetPhotoEnabled = () => useAiMutation((enabled: boolean) => api.ai.setPhotoEnabled(enabled))

// ── Meal photos ──────────────────────────────────────────────────────────
export const useAnalyzePhoto = () =>
  useMutation({ mutationFn: (v: { image: Blob; meal: MealType; hint?: string }) => api.photo.analyze(v.image, { meal: v.meal, hint: v.hint }) })

export const useRefinePhoto = () =>
  useMutation({
    mutationFn: (v: { photoId: string; feedback: string; current: { name: string; grams: number }[]; previousFeedback?: string[]; meal: MealType }) => api.photo.refine(v),
  })

export const usePhotoTotals = (items: { foodId: string; grams: number }[]) =>
  useQuery({
    queryKey: ['photo', 'totals', JSON.stringify(items)],
    queryFn: () => api.photo.totals(items),
    enabled: items.length > 0,
    placeholderData: keepPreviousData,
  })

export function useLogPhotoMeal() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: api.photo.log, onSuccess: () => invalidateDiary(qc) })
}
export function useTestAi() {
  return useMutation({ mutationFn: () => api.ai.test() })
}

export function useBarcodeLookup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => api.barcode.lookup(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['foods'] }),
  })
}

export function useImportBackup() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: (file: unknown) => api.backup.import(file), onSuccess: () => qc.invalidateQueries() })
}
