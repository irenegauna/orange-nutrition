/** Display formatting only — no nutrition math lives here. */
import type { MealType, NutrientInfo, Quantity } from '@/core/types'

export const kcal = (n: number) => Math.round(n).toLocaleString('es-ES')

export const grams = (n: number) => {
  const r = Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n)
  return r.toLocaleString('es-ES')
}

export function nutrientAmount(n: number, unit: NutrientInfo['unit']) {
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2
  const v = Number(n.toFixed(digits))
  return `${v.toLocaleString('es-ES')} ${unit}`
}

export const percent = (n: number) => `${Math.round(n)}%`

export function quantityLabel(q: Quantity) {
  const amount = Number(q.amount.toFixed(2)).toLocaleString('es-ES')
  if (q.serving.label === 'g') return `${amount} g`
  return `${amount} × ${q.serving.label}`
}

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  dinner: 'Cena',
  snacks: 'Snacks',
}

/** "al desayuno", "a la comida", "a la cena", "a los snacks" — for "Añadir …" texts. */
export const TO_MEAL: Record<MealType, string> = {
  breakfast: 'al desayuno',
  lunch: 'a la comida',
  dinner: 'a la cena',
  snacks: 'a los snacks',
}
