import type { MealType } from '@/core/types'
import { cn } from './utils'

/** Decorative emoji: hidden from screen readers (the adjacent text carries the meaning). */
export function Emoji({ children, className }: { children: string; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('emoji inline-block', className)}>
      {children}
    </span>
  )
}

export const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: '🍳',
  lunch: '🥗',
  dinner: '🍲',
  snacks: '🍎',
}

export const MEAL_TINT: Record<MealType, string> = {
  breakfast: 'bg-meal-breakfast',
  lunch: 'bg-meal-lunch',
  dinner: 'bg-meal-dinner',
  snacks: 'bg-meal-snacks',
}

export const MACRO_EMOJI = { protein: '💪', carbs: '🍞', fat: '🥑', fiber: '🌾', calories: '🔥' } as const

// Name keywords first (most specific wins), then the backend's food category.
// Food names are Spanish; they are matched lowercase with accents stripped (see `normalize`).
const BY_NAME: [RegExp, string][] = [
  [/boniato|batata/, '🍠'],
  [/\bhuevos?\b|\bclara de huevo|\byema/, '🥚'], [/platano|banana/, '🍌'], [/manzana/, '🍎'], [/aguacate/, '🥑'],
  [/naranja|mandarina|clementina/, '🍊'], [/limon|\blima\b/, '🍋'], [/fresa|freson/, '🍓'], [/arandano/, '🫐'], [/\buvas?\b/, '🍇'],
  [/sandia|melon/, '🍉'], [/\bpina\b|anana/, '🍍'], [/mango/, '🥭'], [/melocoton|albaricoque|nectarina|paraguayo/, '🍑'], [/\bperas?\b/, '🍐'],
  [/cereza|picota/, '🍒'], [/kiwi/, '🥝'], [/\bcoco\b/, '🥥'], [/tomate/, '🍅'], [/zanahoria/, '🥕'], [/brocoli|coliflor/, '🥦'],
  [/espinaca|lechuga|\bkale\b|col rizada|acelga|\bcol\b|repollo|canonigo|rucula/, '🥬'], [/patata/, '🥔'], [/\bmaiz\b/, '🌽'],
  [/pimiento/, '🫑'], [/pepino|calabacin/, '🥒'], [/cebolla|puerro/, '🧅'], [/\bajos?\b/, '🧄'], [/champinon|seta|\bhongo/, '🍄'],
  [/berenjena/, '🍆'], [/lenteja|alubia|judia|frijol|garbanzo|guisante|\bhabas?\b|tofu|\bsoja/, '🫘'], [/\barroz/, '🍚'],
  [/pasta|espagueti|macarron|fideo|tallarin|lasana/, '🍝'], [/\bpan\b|tostada|baguette|biscote/, '🍞'], [/avena|cereales|granola|muesli|gachas/, '🥣'],
  [/\bcafe\b|espresso/, '☕'], [/yogur|kefir/, '🥛'], [/leche/, '🥛'], [/queso|mozzarella|cheddar|\bfeta\b|requeson/, '🧀'], [/mantequilla/, '🧈'],
  [/salmon|atun|bacalao|sardina|tilapia|trucha|pescado|merluza|caballa|boqueron|anchoa|dorada|lubina/, '🐟'],
  [/gamba|langostino|cangrejo|langosta|bogavante|camaron/, '🦐'],
  [/pollo|pavo|pato\b/, '🍗'], [/bacon|beicon|jamon|cerdo|salchicha|chorizo|lomo embuchado|panceta/, '🥓'], [/ternera|vacuno|filete|chuleton|cordero|buey/, '🥩'],
  [/almendra|nuez|nueces|anacardo|avellana|pistacho|frutos secos/, '🥜'], [/cacahuete/, '🥜'], [/aceituna|oliva/, '🫒'],
  [/\bmiel\b/, '🍯'], [/chocolate|cacao/, '🍫'], [/galleta/, '🍪'], [/bizcocho|tarta|pastel|magdalena|bolleria|croissant|cruasan/, '🥐'],
  [/helado/, '🍨'], [/\bte\b|infusion/, '🍵'], [/zumo/, '🧃'], [/\bagua\b/, '💧'],
  [/\bvino\b/, '🍷'], [/cerveza/, '🍺'], [/pizza/, '🍕'], [/hamburguesa/, '🍔'], [/bocadillo|sandwich|wrap/, '🥪'],
  [/sopa|guiso|estofado|caldo|cocido madrileno|puchero|potaje/, '🍲'], [/ensalada/, '🥗'], [/quinoa|cuscus|cebada|trigo sarraceno|alforfon|trigo|grano/, '🌾'],
]

const BY_CATEGORY: Record<string, string> = {
  fruits: '🍎', vegetables: '🥦', meat: '🥩', poultry: '🍗', fish: '🐟', seafood: '🦐', eggs: '🥚',
  dairy: '🧀', grains: '🌾', legumes: '🫘', nuts_seeds: '🥜', oils_fats: '🫒', sweeteners: '🍯',
  condiments: '🧂', spices: '🌶️', beverages: '🥤', sweets: '🍫', prepared: '🍱', recipe: '👩‍🍳',
}

/** Lowercase and strip diacritics ("Plátano" → "platano", "Piña" → "pina"). */
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function foodEmoji(name: string, category?: string): string {
  const n = normalize(name)
  for (const [re, e] of BY_NAME) if (re.test(n)) return e
  return (category && BY_CATEGORY[category]) || '🍽️'
}

export function greetingEmoji(now = new Date()) {
  const h = now.getHours()
  if (h >= 5 && h < 12) return '☀️'
  if (h >= 12 && h < 19) return '🌤️'
  return '🌙'
}
