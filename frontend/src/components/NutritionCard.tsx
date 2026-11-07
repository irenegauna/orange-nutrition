import type { Macros } from '@/core/types'
import { grams, kcal } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Compact kcal + macro grid for a food, recipe or recommendation. */
export function NutritionCard({ nutrition, className, label }: { nutrition: Macros; className?: string; label?: string }) {
  const cells = [
    { k: 'Proteínas', v: nutrition.protein, c: 'bg-protein' },
    { k: 'Hidratos', v: nutrition.carbs, c: 'bg-carbs' },
    { k: 'Grasas', v: nutrition.fat, c: 'bg-fat' },
    { k: 'Fibra', v: nutrition.fiber, c: 'bg-fiber' },
  ]
  return (
    <div className={cn('rounded-2xl bg-surface-2/70 p-4', className)}>
      {label && <p className="mb-1 text-[12px] font-medium uppercase tracking-wide text-muted">{label}</p>}
      <div className="flex items-baseline gap-1.5">
        <span className="tabular text-[30px] font-semibold leading-none tracking-tight">{kcal(nutrition.calories)}</span>
        <span className="text-sm text-muted">kcal</span>
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2">
        {cells.map((c) => (
          <div key={c.k} className="min-w-0">
            <dt className="flex items-center gap-1 text-[11.5px] text-muted">
              <span className={cn('size-1.5 rounded-full', c.c)} />
              {c.k}
            </dt>
            <dd className="tabular text-[15px] font-semibold">{grams(c.v)} g</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
