import { useEffect, useState, type ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const TOKENS = ['primary', 'accent', 'muted', 'border', 'protein', 'carbs', 'fat', 'fiber', 'warning', 'track', 'surface', 'foreground'] as const
type Colors = Record<(typeof TOKENS)[number], string>

const readColors = (): Colors => {
  const s = getComputedStyle(document.documentElement)
  return Object.fromEntries(TOKENS.map((t) => [t, s.getPropertyValue(`--${t}`).trim()])) as Colors
}

/** Resolved theme colors for SVG (Recharts props don't reliably resolve CSS vars). */
export function useThemeColors() {
  const [c, setC] = useState(readColors)
  useEffect(() => {
    const obs = new MutationObserver(() => setC(readColors()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return c
}

export interface ChartDatum {
  label: string
  fullLabel: string
  [k: string]: string | number | null
}

export interface SeriesDef {
  key: string
  name: string
  color: keyof Colors
  unit: string
}

function ChartTooltip({ active, payload, series }: { active?: boolean; payload?: readonly { payload?: unknown }[]; series: SeriesDef[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as ChartDatum
  return (
    <div className="rounded-2xl border border-border bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      <p className="mb-1 font-semibold">{d.fullLabel}</p>
      {series.map((s) => {
        const v = d[s.key]
        return (
          <p key={s.key} className="flex justify-between gap-4 tabular text-muted">
            <span>{s.name}</span>
            <span className="font-medium text-foreground">{v === null || v === undefined ? 'Sin datos' : `${Math.round(Number(v)).toLocaleString('es-ES')} ${s.unit}`}</span>
          </p>
        )
      })}
    </div>
  )
}

export function ChartCard({ title, subtitle, children, legend }: { title: string; subtitle?: string; children: ReactNode; legend?: SeriesDef[] }) {
  const c = useThemeColors()
  return (
    <section className="rounded-[var(--radius-card)] border border-border/70 bg-surface p-4 pb-2">
      <div className="mb-2 flex items-start justify-between gap-2 px-1">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="text-[12.5px] text-muted">{subtitle}</p>}
        </div>
        {legend && (
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11.5px] text-muted">
            {legend.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: c[s.color] }} />
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="h-44 w-full">{children}</div>
    </section>
  )
}

/** Clean Y-axis ticks (4 equal "round" steps) covering the data and target. */
function niceTicks(data: ChartDatum[], keys: string[], stacked: boolean, target?: number | null) {
  let max = target ?? 0
  for (const d of data) {
    const vals = keys.map((k) => Number(d[k] ?? 0))
    max = Math.max(max, stacked ? vals.reduce((a, b) => a + b, 0) : Math.max(...vals))
  }
  if (!(max > 0)) return [0, 1]
  const raw = (max * 1.05) / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * mag).find((x) => x >= raw)!
  return [0, 1, 2, 3, 4].map((i) => Number((i * step).toPrecision(6)))
}

const axisProps = (c: Colors) => ({
  tick: { fill: c.muted, fontSize: 11 },
  axisLine: false,
  tickLine: false,
})

export function NutritionBarChart({
  data,
  series,
  target,
  stacked,
}: {
  data: ChartDatum[]
  series: SeriesDef[]
  target?: number
  stacked?: boolean
}) {
  const c = useThemeColors()
  const ticks = niceTicks(data, series.map((s) => s.key), !!stacked, target)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={c.border} strokeDasharray="3 4" />
        <XAxis dataKey="label" {...axisProps(c)} interval="preserveStartEnd" minTickGap={6} />
        <YAxis {...axisProps(c)} width={40} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} />
        <Tooltip cursor={{ fill: c.track, opacity: 0.6 }} content={(p) => <ChartTooltip active={p.active} payload={p.payload} series={series} />} />
        {target !== undefined && <ReferenceLine y={target} stroke={c.accent} strokeDasharray="4 4" strokeWidth={1.5} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId={stacked ? 'a' : undefined}
            fill={c[s.color]}
            radius={!stacked || i === series.length - 1 ? [6, 6, 0, 0] : 0}
            maxBarSize={28}
            isAnimationActive={!window.matchMedia('(prefers-reduced-motion: reduce)').matches}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

export function NutritionLineChart({ data, series, target }: { data: ChartDatum[]; series: SeriesDef[]; target?: number | null }) {
  const c = useThemeColors()
  const ticks = niceTicks(data, series.map((s) => s.key), false, target)
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={c.border} strokeDasharray="3 4" />
        <XAxis dataKey="label" {...axisProps(c)} interval="preserveStartEnd" minTickGap={6} />
        <YAxis {...axisProps(c)} width={40} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} />
        <Tooltip cursor={{ stroke: c.border }} content={(p) => <ChartTooltip active={p.active} payload={p.payload} series={series} />} />
        {target ? <ReferenceLine y={target} stroke={c.accent} strokeDasharray="4 4" strokeWidth={1.5} /> : null}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.name}
            stroke={c[s.color]}
            strokeWidth={2.5}
            dot={{ r: 3, fill: c[s.color], strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls={false}
            isAnimationActive={!window.matchMedia('(prefers-reduced-motion: reduce)').matches}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
