import { ChevronRight } from 'lucide-react'
import type { NutrientCoverage, NutrientInfo } from '@/core/types'
import { nutrientAmount, percent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { classifyNutrientStatus, type NutrientStatus } from './nutrientStatus'
import { NUTRIENT_INFO } from '@/lib/nutrientInfo'

const STATUS_COPY: Record<NutrientStatus, string> = {
  'no-data': 'No data yet',
  incomplete: 'Partial data',
  low: 'Below target',
  'on-track': 'On track',
  high: 'Above target',
}

const STATUS_CLASS: Record<NutrientStatus, string> = {
  'no-data': 'text-muted',
  incomplete: 'text-muted',
  low: 'text-warning',
  'on-track': 'text-sage',
  high: 'text-danger',
}

export function NutrientStatusBadge({ status, isLimit, noTarget }: { status: NutrientStatus; isLimit?: boolean; noTarget?: boolean }) {
  if (noTarget && status !== 'no-data') return <span className="text-[12px] font-semibold text-muted">No EU reference</span>
  const label = isLimit && status === 'high' ? 'Above limit' : isLimit && status === 'on-track' ? 'Within limit' : STATUS_COPY[status]
  return <span className={cn('text-[12px] font-semibold', STATUS_CLASS[status])}>{label}</span>
}

/**
 * Three visually distinct states:
 *  - confirmed (low/on-track/high): solid bar + %
 *  - incomplete: hatched bar, completeness note, no verdict
 *  - no data: dashed empty track, no %
 */
export function NutrientProgress({
  coverage,
  info,
  onSelect,
}: {
  coverage: NutrientCoverage
  info: NutrientInfo
  onSelect?: () => void
}) {
  const status = classifyNutrientStatus(coverage, info)
  const pct = coverage.percentOfTarget
  const width = pct === null ? 0 : Math.min(pct, 100)
  const confirmed = status === 'low' || status === 'on-track' || status === 'high'
  const barColor = status === 'high' ? 'bg-danger/80' : status === 'low' ? 'bg-carbs' : 'bg-fiber'

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-2xl px-1 py-3 text-left transition active:bg-surface-2"
      aria-label={`${info.label}: ${status === 'no-data' ? 'no data' : nutrientAmount(coverage.intake, info.unit)}${pct !== null && confirmed ? `, ${percent(pct)} of target` : ''}. ${STATUS_COPY[status]}.`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-medium">{info.label}</span>
          <NutrientStatusBadge status={status} isLimit={info.isLimit} noTarget={coverage.target === null} />
        </div>
        <p className="truncate text-[12px] text-muted">{NUTRIENT_INFO[info.key].short}</p>
        <div className="mt-2">
          {status === 'no-data' ? (
            <div className="h-2 rounded-full border border-dashed border-muted/40" />
          ) : (
            <div className="relative h-2 overflow-hidden rounded-full bg-track">
              <div
                className={cn('h-full rounded-full transition-[width] duration-700', confirmed ? barColor : 'hatched')}
                style={{ width: `${Math.max(width, confirmed ? 2 : 100)}%` }}
              />
            </div>
          )}
        </div>
        <div className="mt-1.5 flex justify-between gap-2 text-[12px] text-muted tabular">
          {status === 'no-data' ? (
            <span>None of today's foods report {info.label.toLowerCase()}</span>
          ) : (
            <>
              <span>
                {nutrientAmount(coverage.intake, info.unit)}
                {coverage.target ? ` of ${nutrientAmount(coverage.target, info.unit)}` : ''}
                {confirmed && pct !== null ? ` · ${percent(pct)}` : ''}
              </span>
              {!confirmed && (
                <span>
                  {coverage.reportingEntries}/{coverage.totalEntries} foods report
                </span>
              )}
            </>
          )}
        </div>
      </div>
      {onSelect && <ChevronRight className="size-4 shrink-0 text-muted/70" />}
    </button>
  )
}
