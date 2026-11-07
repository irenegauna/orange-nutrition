import { ChevronRight, Star } from 'lucide-react'
import type { ReactNode } from 'react'
import { grams, kcal } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Emoji } from '@/lib/emoji'

export function FoodListItem({
  name,
  detail,
  calories,
  macros,
  onClick,
  favorite,
  trailing,
  className,
  emoji,
}: {
  emoji?: string
  name: string
  detail?: string
  calories: number
  macros?: { protein: number; carbs: number; fat: number }
  onClick?: () => void
  favorite?: boolean
  trailing?: ReactNode
  className?: string
}) {
  const body = (
    <>
      {emoji && (
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-surface-2">
          <Emoji className="text-[20px]">{emoji}</Emoji>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[15px] font-medium">{name}</span>
          {favorite && <Star className="size-3.5 shrink-0 fill-carbs text-carbs" aria-label="Favorito" />}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted tabular">
          {detail && <span className="truncate">{detail}</span>}
          {macros && (
            <span className="flex gap-2">
              <span><b className="font-medium text-protein">P</b> {grams(macros.protein)}</span>
              <span><b className="font-medium text-carbs">H</b> {grams(macros.carbs)}</span>
              <span><b className="font-medium text-fat">G</b> {grams(macros.fat)}</span>
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="tabular text-[15px] font-semibold">{kcal(calories)}</span>
        <span className="text-[12px] text-muted">kcal</span>
        {trailing ?? (onClick && <ChevronRight className="size-4 text-muted/60" />)}
      </div>
    </>
  )
  const cls = cn('flex min-h-14 w-full items-center gap-3 py-2.5 text-left', className)
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'rounded-xl transition active:bg-surface-2')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}
