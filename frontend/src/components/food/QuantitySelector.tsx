import { Minus, Plus } from 'lucide-react'
import type { Quantity, Serving } from '@/core/types'
import { cn } from '@/lib/utils'

export function QuantitySelector({
  value,
  onChange,
  servings,
}: {
  value: Quantity
  onChange: (q: Quantity) => void
  servings: Serving[]
}) {
  const isGrams = value.serving.grams === 1
  const step = isGrams ? 10 : 0.5
  const set = (amount: number) => onChange({ ...value, amount: Math.max(0, Math.round(amount * 100) / 100) })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-1.5">
        <button
          type="button"
          aria-label="Reducir cantidad"
          onClick={() => set(value.amount - step)}
          disabled={value.amount <= step}
          className="grid size-11 place-items-center rounded-xl bg-surface text-foreground shadow-sm transition active:scale-95 disabled:opacity-40"
        >
          <Minus className="size-4" />
        </button>
        <label className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5">
          <span className="sr-only">Cantidad</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={step}
            value={Number.isFinite(value.amount) ? value.amount : ''}
            onChange={(e) => set(Number(e.target.value))}
            className="w-24 bg-transparent text-center text-[28px] font-semibold tracking-tight outline-none tabular"
          />
          <span className="truncate text-sm text-muted">{isGrams ? 'g' : '×'}</span>
        </label>
        <button
          type="button"
          aria-label="Aumentar cantidad"
          onClick={() => set(value.amount + step)}
          className="grid size-11 place-items-center rounded-xl bg-surface text-foreground shadow-sm transition active:scale-95"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {servings.length > 1 && (
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1" role="radiogroup" aria-label="Tamaño de la ración">
          {servings.map((s) => {
            const active = s.label === value.serving.label && s.grams === value.serving.grams
            return (
              <button
                key={`${s.label}-${s.grams}`}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() =>
                  onChange({
                    serving: s,
                    // Keep roughly the same total weight when switching units.
                    amount: s.grams === 1 ? Math.round(value.amount * value.serving.grams) : 1,
                  })
                }
                className={cn(
                  'h-10 shrink-0 rounded-full border px-4 text-[13px] font-medium transition',
                  active ? 'border-accent bg-accent text-white dark:text-background' : 'border-border bg-surface text-foreground',
                )}
              >
                {s.label === 'g' ? 'gramos' : `${s.label}${s.grams !== 1 ? ` · ${Math.round(s.grams)} g` : ''}`}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
