import { grams } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Emoji, MACRO_EMOJI } from '@/lib/emoji'

export type MacroTone = 'protein' | 'carbs' | 'fat' | 'fiber'

const toneBg: Record<MacroTone, string> = {
  protein: 'bg-protein',
  carbs: 'bg-carbs',
  fat: 'bg-fat',
  fiber: 'bg-fiber',
}

export function ProgressTrack({ ratio, tone, className }: { ratio: number; tone: MacroTone; className?: string }) {
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-track', className)}>
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-out', toneBg[tone])}
        style={{ width: `${Math.min(Math.max(ratio, 0), 1) * 100}%` }}
      />
    </div>
  )
}

export function MacroProgressBar({
  label,
  consumed,
  target,
  tone,
  compact,
}: {
  label: string
  consumed: number
  target: number
  tone: MacroTone
  compact?: boolean
}) {
  const remaining = target - consumed
  // Protein and fiber are "at least" goals: going past them is good news, not "over".
  const isMinimum = tone === 'protein' || tone === 'fiber'
  const status =
    remaining >= 0 ? `Quedan ${grams(remaining)} g` : isMinimum ? '🎉 Objetivo cumplido' : `${grams(-remaining)} g de más`
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1 text-[13px] font-medium text-muted">
          <Emoji className="text-[14px]">{MACRO_EMOJI[tone]}</Emoji>
          {label}
        </span>
        {!compact && (
          <span className="text-[12px] text-muted tabular">
            {status}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="tabular text-[19px] font-semibold tracking-tight">{grams(consumed)}</span>
        <span className="tabular text-[13px] text-muted">/ {grams(target)} g</span>
      </div>
      <ProgressTrack className="mt-2" ratio={target > 0 ? consumed / target : 0} tone={tone} />
      {compact && (
        <p className="mt-1.5 text-[12px] text-muted tabular">
          {status}
        </p>
      )}
    </div>
  )
}
