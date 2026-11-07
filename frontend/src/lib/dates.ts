import { format, isToday, isYesterday, isTomorrow, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { ISODate } from '@/core/types'

export const toISO = (d: Date): ISODate => format(d, 'yyyy-MM-dd')
export const todayISO = () => toISO(new Date())
export const fromISO = (d: ISODate) => parseISO(d)

/** Capitalise the first letter (Spanish day/month names are lowercase). */
export const capitalize = (s: string) => (s ? s.charAt(0).toLocaleUpperCase('es-ES') + s.slice(1) : s)

/** date-fns `format` with the Spanish (Spain) locale. */
export const formatEs = (d: Date, pattern: string) => format(d, pattern, { locale: es })

export function relativeDayLabel(d: ISODate) {
  const date = parseISO(d)
  if (isToday(date)) return 'Hoy'
  if (isYesterday(date)) return 'Ayer'
  if (isTomorrow(date)) return 'Mañana'
  return capitalize(formatEs(date, 'EEEE'))
}

export function greeting(now = new Date()) {
  const h = now.getHours()
  if (h < 5) return 'Buenas noches'
  if (h < 12) return 'Buenos días'
  if (h < 18) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Suggest a meal for "now" when opening Add Food without context. */
export function mealForNow(now = new Date()) {
  const h = now.getHours()
  if (h < 11) return 'breakfast' as const
  if (h < 15) return 'lunch' as const
  if (h < 21) return 'dinner' as const
  return 'snacks' as const
}
