import { format } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Settings } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays } from 'date-fns'
import { MEAL_TYPES, type LogEntry, type MealType } from '@/core/types'
import { CalorieProgress } from '@/components/CalorieProgress'
import { CalendarGrid } from '@/components/CalendarPicker'
import { MacroProgressBar } from '@/components/MacroProgressBar'
import { MealSection } from '@/components/MealSection'
import { IconButton } from '@/components/PageHeader'
import { ErrorState } from '@/components/States'
import { FoodDetailSheet } from '@/components/food/FoodDetailSheet'
import { Card } from '@/components/ui/card'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { fromISO, greeting, relativeDayLabel, toISO, todayISO } from '@/lib/dates'
import { kcal } from '@/lib/format'
import { useSelectedDate } from '@/lib/selectedDate'
import { useDailyInsights, useDaySummary, usePreferences, useProfile } from '@/services/queries'
import { Emoji, greetingEmoji } from '@/lib/emoji'
import type { DailyInsight } from '@/core/types'

const INSIGHT_EMOJI: Record<DailyInsight['kind'], string> = { protein: '💪', fiber: '🌾', calories: '🔥', micronutrient: '💊', general: '👋' }

export function TodayScreen() {
  const { date, setDate } = useSelectedDate()
  const navigate = useNavigate()
  const day = useDaySummary(date)
  const insights = useDailyInsights(date)
  const prefs = usePreferences()
  const profile = useProfile()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [editing, setEditing] = useState<LogEntry | null>(null)
  const isToday = date === todayISO()

  const shift = (n: number) => setDate(toISO(addDays(fromISO(date), n)))
  const addTo = (meal: MealType) => navigate(`/add?meal=${meal}`)
  const name = prefs.data?.displayName?.trim()

  return (
    <div className="animate-fade-up">
      <header className="flex items-start justify-between gap-3 pb-5 pt-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-muted">{format(fromISO(date), 'EEEE, MMMM d')}</p>
          <h1 className="mt-0.5 truncate text-[28px] font-semibold leading-tight tracking-tight">
            {isToday ? `${greeting()}${name ? `, ${name}` : ''}` : relativeDayLabel(date)}{' '}
            {isToday && <Emoji>{greetingEmoji()}</Emoji>}
          </h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <IconButton label="Choose date" onClick={() => setCalendarOpen(true)}>
            <CalendarDays className="size-5" />
          </IconButton>
          <IconButton label="Settings" onClick={() => navigate('/settings')}>
            <Settings className="size-5" />
          </IconButton>
        </div>
      </header>

      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => shift(-1)} aria-label="Previous day">
          <ChevronLeft className="size-4" /> Prev
        </Button>
        {!isToday && (
          <Button variant="soft" size="sm" onClick={() => setDate(todayISO())}>
            Back to today
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => shift(1)} aria-label="Next day">
          Next <ChevronRight className="size-4" />
        </Button>
      </div>

      {day.isError ? (
        <ErrorState error={day.error} onRetry={() => day.refetch()} />
      ) : !day.data ? (
        <TodaySkeleton />
      ) : (
        <div className="space-y-4">
          {profile.data === null && (
            <button
              type="button"
              onClick={() => navigate('/settings#profile')}
              className="flex w-full items-center gap-3 rounded-[var(--radius-card)] bg-linear-to-br from-meal-snacks to-sage-soft p-4 text-left transition active:scale-[0.99]"
            >
              <Emoji className="text-[28px]">👤</Emoji>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">Personalise your targets</span>
                <span className="block text-[13px] text-foreground/70">Add your age, height, weight and goal — we’ll calculate what you need (EU guidelines).</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted" />
            </button>
          )}
          <Card className="flex flex-col items-center gap-5 bg-linear-to-br from-surface via-surface to-soft sm:flex-row sm:items-center sm:gap-8">
            <CalorieProgress consumed={day.data.totals.calories} target={day.data.goals.calories} />
            <div className="grid w-full grid-cols-2 gap-x-4 gap-y-3 sm:flex-1">
              <Stat emoji="🍽️" label="Eaten" value={kcal(day.data.totals.calories)} unit="kcal" />
              <Stat emoji="🎯" label="Target" value={kcal(day.data.goals.calories)} unit="kcal" />
            </div>
          </Card>

          <Card>
            <h2 className="sr-only">Macronutrients</h2>
            <div className="grid grid-cols-3 gap-4">
              <MacroProgressBar compact label="Protein" tone="protein" consumed={day.data.totals.protein} target={day.data.goals.protein} />
              <MacroProgressBar compact label="Carbs" tone="carbs" consumed={day.data.totals.carbs} target={day.data.goals.carbs} />
              <MacroProgressBar compact label="Fat" tone="fat" consumed={day.data.totals.fat} target={day.data.goals.fat} />
            </div>
            <div className="mt-5 border-t border-border/70 pt-4">
              <MacroProgressBar label="Fiber" tone="fiber" consumed={day.data.totals.fiber} target={day.data.goals.fiber} />
            </div>
          </Card>

          {insights.data && insights.data.length > 0 && (
            <Card className="border-transparent bg-linear-to-br from-soft to-meal-lunch">
              <div className="flex items-center gap-2 text-accent">
                <Emoji className="text-[16px]">💡</Emoji>
                <h2 className="text-[13px] font-semibold uppercase tracking-wide">Insights</h2>
              </div>
              <ul className="mt-2 space-y-3">
                {insights.data.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3">
                    <p className="flex gap-2 text-[15px] leading-snug text-foreground">
                      <Emoji className="text-[17px]">{INSIGHT_EMOJI[i.kind]}</Emoji>
                      {i.message}
                    </p>
                    {i.action && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => navigate(`/assistant?q=${encodeURIComponent(i.action!.prompt)}`)}
                      >
                        {i.action.label}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="space-y-3 pt-2">
            <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">Meals</h2>
            {MEAL_TYPES.map((m) => (
              <MealSection key={m} summary={day.data.meals[m]} onAdd={addTo} onSelectEntry={setEditing} />
            ))}
          </div>
        </div>
      )}

      <Sheet open={calendarOpen} onOpenChange={setCalendarOpen} title="Choose a day">
        <CalendarGrid
          value={date}
          onChange={(d) => {
            setDate(d)
            setCalendarOpen(false)
          }}
        />
      </Sheet>
      <FoodDetailSheet mode="edit" entry={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function Stat({ emoji, label, value, unit }: { emoji: string; label: string; value: string; unit: string }) {
  return (
    <div className="rounded-2xl bg-surface/80 px-4 py-3 shadow-[0_1px_2px_rgba(43,36,32,0.05)]">
      <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
        <Emoji className="text-[14px]">{emoji}</Emoji>
        {label}
      </p>
      <p className="mt-0.5 tabular text-[20px] font-semibold tracking-tight">
        {value} <span className="text-[13px] font-medium text-muted">{unit}</span>
      </p>
    </div>
  )
}

function TodaySkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading your day">
      <Skeleton className="h-[290px] w-full rounded-[22px]" />
      <Skeleton className="h-[170px] w-full rounded-[22px]" />
      <Skeleton className="h-20 w-full rounded-[22px]" />
      <Skeleton className="h-20 w-full rounded-[22px]" />
    </div>
  )
}
