import { useId } from 'react'
import { kcal } from '@/lib/format'

/** Large circular calorie ring. Values come straight from the day summary. */
export function CalorieProgress({ consumed, target, size = 176 }: { consumed: number; target: number; size?: number }) {
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const ratio = target > 0 ? consumed / target : 0
  const shown = Math.min(ratio, 1)
  const over = ratio > 1
  const remaining = target - consumed
  const gid = useId()
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--primary-2)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--primary)' }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? 'var(--danger)' : `url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - shown)}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
        role="img"
        aria-label={`${kcal(consumed)} de ${kcal(target)} calorías consumidas, ${remaining >= 0 ? 'quedan' : 'te has pasado'} ${kcal(Math.abs(remaining))}`}
      >
        <span aria-hidden className="emoji mb-1 text-[22px]">{over ? '😬' : '🔥'}</span>
        <span className="tabular text-[40px] font-semibold leading-none tracking-tight">{kcal(Math.abs(remaining))}</span>
        <span className="mt-1.5 text-[13px] font-medium text-muted">{remaining >= 0 ? 'kcal restantes' : 'kcal de más'}</span>
      </div>
    </div>
  )
}
