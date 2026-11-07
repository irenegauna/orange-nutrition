import { useSearchParams } from 'react-router-dom'
import { MEAL_TYPES, type MealType } from '@/core/types'
import { PageHeader } from '@/components/PageHeader'
import { SegmentedControl } from '@/components/ui/segmented'
import { mealForNow, relativeDayLabel } from '@/lib/dates'
import { MEAL_LABELS } from '@/lib/format'
import { useSelectedDate } from '@/lib/selectedDate'
import { SearchTab } from './SearchTab'
import { ScanTab } from './ScanTab'
import { CustomFoodForm } from './CustomFoodForm'
import { RecipesTab } from './RecipesTab'
import { PhotoTab } from './PhotoTab'
import { Emoji } from '@/lib/emoji'

type Tab = 'search' | 'scan' | 'photo' | 'custom' | 'recipes'
const TABS: Tab[] = ['search', 'scan', 'photo', 'custom', 'recipes']

export function AddFoodScreen() {
  const [params, setParams] = useSearchParams()
  const { date } = useSelectedDate()
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'search') as Tab
  const mealParam = params.get('meal') as MealType | null
  const meal: MealType = mealParam && MEAL_TYPES.includes(mealParam) ? mealParam : mealForNow()

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) (v === null ? next.delete(k) : next.set(k, v))
    setParams(next, { replace: true })
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Añadir comida" emoji="🍽️"
        subtitle={
          <span>
            Registrando en <b className="font-semibold text-foreground">{MEAL_LABELS[meal]}</b> · {relativeDayLabel(date)}
          </span>
        }
      />
      <SegmentedControl
        label="Forma de añadir"
        stacked
        value={tab}
        onChange={(t) => update({ tab: t, barcode: null })}
        className="mb-5"
        options={[
          { value: 'search', label: 'Buscar', icon: <Emoji>🔍</Emoji> },
          { value: 'scan', label: 'Código', icon: <Emoji>🏷️</Emoji> },
          { value: 'photo', label: 'Foto', icon: <Emoji>📸</Emoji> },
          { value: 'custom', label: 'Crear', icon: <Emoji>✍️</Emoji> },
          { value: 'recipes', label: 'Recetas', icon: <Emoji>👩‍🍳</Emoji> },
        ]}
      />
      {tab === 'search' && <SearchTab meal={meal} date={date} />}
      {tab === 'scan' && <ScanTab meal={meal} date={date} onCreateCustom={(code) => update({ tab: 'custom', barcode: code })} />}
      {tab === 'photo' && <PhotoTab meal={meal} date={date} />}
      {tab === 'custom' && <CustomFoodForm meal={meal} date={date} barcode={params.get('barcode') ?? undefined} />}
      {tab === 'recipes' && <RecipesTab meal={meal} date={date} />}
    </div>
  )
}
