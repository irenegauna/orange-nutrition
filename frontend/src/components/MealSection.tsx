import { Plus } from 'lucide-react'
import type { LogEntry, MealSummary, MealType } from '@/core/types'
import { MEAL_LABELS, TO_MEAL, grams, kcal, quantityLabel } from '@/lib/format'
import { Card } from './ui/card'
import { FoodListItem } from './food/FoodListItem'
import { Emoji, MEAL_EMOJI, MEAL_TINT, foodEmoji } from '@/lib/emoji'
import { cn } from '@/lib/utils'

export function MealSection({
  summary,
  onAdd,
  onSelectEntry,
}: {
  summary: MealSummary
  onAdd: (meal: MealType) => void
  onSelectEntry: (e: LogEntry) => void
}) {
  const { meal, entries, totals } = summary
  return (
    <Card className="overflow-hidden p-0">
      <div className={cn('flex items-center gap-3 px-5 pb-3 pt-4', entries.length > 0 && 'border-b border-border/60')}>
        <div className={cn('grid size-11 place-items-center rounded-2xl', MEAL_TINT[meal])}>
          <Emoji className="text-[22px]">{MEAL_EMOJI[meal]}</Emoji>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-semibold tracking-tight">{MEAL_LABELS[meal]}</h3>
          <p className="text-[12.5px] text-muted tabular">
            {entries.length
              ? `${kcal(totals.calories)} kcal · P ${grams(totals.protein)} · H ${grams(totals.carbs)} · G ${grams(totals.fat)}`
              : 'Nada registrado'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onAdd(meal)}
          aria-label={`Añadir comida ${TO_MEAL[meal]}`}
          className="grid size-11 place-items-center rounded-full bg-brand-gradient text-white shadow-[0_4px_12px_-4px_rgba(240,127,46,0.7)] transition active:scale-95 dark:text-background"
        >
          <Plus className="size-5" />
        </button>
      </div>
      {entries.length > 0 && (
        <ul className="divide-y divide-border/70 px-5 pb-2">
          {entries.map((e) => (
            <li key={e.id}>
              <FoodListItem
                emoji={foodEmoji(e.name, e.category)}
                name={e.name}
                detail={quantityLabel(e.quantity)}
                calories={e.nutrition.calories}
                macros={e.nutrition}
                onClick={() => onSelectEntry(e)}
              />
            </li>
          ))}
        </ul>
      )}
      {entries.length === 0 && <div className="h-3" />}
    </Card>
  )
}
