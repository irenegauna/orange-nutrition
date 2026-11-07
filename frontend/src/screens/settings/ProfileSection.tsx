import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { NUTRIENTS, type ActivityLevel, type Goals, type MicronutrientKey, type ProfileState, type Sex, type WeightObjective } from '@/core/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FieldError, Input, Label } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented'
import { LoadingState } from '@/components/States'
import { Emoji } from '@/lib/emoji'
import { grams, kcal, nutrientAmount } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useProfile, useSaveProfile } from '@/services/queries'

const ACTIVITY: { value: ActivityLevel; emoji: string; label: string; hint: string }[] = [
  { value: 'sedentary', emoji: '🛋️', label: 'Mostly sitting', hint: 'Desk job, little exercise' },
  { value: 'moderate', emoji: '🚶', label: 'Lightly active', hint: 'Walking, or exercise 2–3 times a week' },
  { value: 'active', emoji: '🚴', label: 'Active', hint: 'On your feet a lot, or exercise most days' },
  { value: 'very_active', emoji: '🏋️', label: 'Very active', hint: 'Physical job or hard training every day' },
]

const OBJECTIVES: { value: WeightObjective; label: string; emoji: string }[] = [
  { value: 'lose', label: 'Lose', emoji: '📉' },
  { value: 'maintain', label: 'Maintain', emoji: '⚖️' },
  { value: 'gain', label: 'Gain', emoji: '📈' },
]

interface Draft {
  sex: Sex | null
  age: string
  heightCm: string
  weightKg: string
  activity: ActivityLevel
  objective: WeightObjective
}

const toDraft = (p: ProfileState | null): Draft =>
  p
    ? { sex: p.profile.sex, age: String(p.profile.age), heightCm: String(p.profile.heightCm), weightKg: String(p.profile.weightKg), activity: p.profile.activity, objective: p.profile.objective }
    : { sex: null, age: '', heightCm: '', weightKg: '', activity: 'moderate', objective: 'maintain' }

/** Body data form → targets calculated by the backend (EFSA / EASO / AESAN). Targets are never typed in. */
export function ProfileSection({ fallbackGoals }: { fallbackGoals: Goals }) {
  const profile = useProfile()
  const save = useSaveProfile()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})

  useEffect(() => {
    if (profile.data !== undefined && draft === null) setDraft(toDraft(profile.data))
  }, [profile.data, draft])
  useEffect(() => {
    if (window.location.hash.endsWith('#profile')) document.getElementById('profile')?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  if (!draft) return <LoadingState rows={3} />
  const set = (patch: Partial<Draft>) => {
    setDraft({ ...draft, ...patch })
    setErrors({})
  }

  async function submit() {
    const e: Partial<Record<keyof Draft, string>> = {}
    const num = (v: string) => Number(v.replace(',', '.'))
    if (!draft!.sex) e.sex = 'Choose one'
    if (!draft!.age.trim() || !Number.isInteger(num(draft!.age))) e.age = 'Enter your age in years'
    if (!draft!.heightCm.trim() || !(num(draft!.heightCm) > 0)) e.heightCm = 'Enter your height in cm'
    if (!draft!.weightKg.trim() || !(num(draft!.weightKg) > 0)) e.weightKg = 'Enter your weight in kg'
    setErrors(e)
    if (Object.keys(e).length) return
    try {
      await save.mutateAsync({
        sex: draft!.sex!,
        age: num(draft!.age),
        heightCm: num(draft!.heightCm),
        weightKg: num(draft!.weightKg),
        activity: draft!.activity,
        objective: draft!.objective,
      })
      toast.success('🎯 Your daily targets are updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save your profile')
    }
  }

  const field = (key: 'age' | 'heightCm' | 'weightKg', label: string, unit: string, placeholder: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`profile-${key}`}>{label}</Label>
      <div className="relative">
        <Input
          id={`profile-${key}`}
          inputMode="decimal"
          placeholder={placeholder}
          value={draft[key]}
          aria-invalid={!!errors[key]}
          className="pr-12"
          onChange={(e) => set({ [key]: e.target.value } as Partial<Draft>)}
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">{unit}</span>
      </div>
      <FieldError>{errors[key]}</FieldError>
    </div>
  )

  return (
    <>
      <section id="profile" className="scroll-mt-4">
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">👤 About you</h2>
        <p className="mb-2 mt-0.5 px-1 text-[13px] text-muted">Your daily targets are calculated from this, following EU and Spanish references. Stored only on this device.</p>
        <Card className="space-y-5">
          <div className="space-y-1.5">
            <Label>Sex</Label>
            <SegmentedControl<Sex | ''>
              label="Sex"
              value={draft.sex ?? ''}
              onChange={(v) => v && set({ sex: v })}
              options={[
                { value: 'female', label: 'Female', icon: <Emoji>👩</Emoji> },
                { value: 'male', label: 'Male', icon: <Emoji>👨</Emoji> },
              ]}
            />
            <FieldError>{errors.sex}</FieldError>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {field('age', 'Age', 'y', '30')}
            {field('heightCm', 'Height', 'cm', '165')}
            {field('weightKg', 'Weight', 'kg', '60')}
          </div>
          <div className="space-y-2">
            <Label>How active are you?</Label>
            <div className="grid gap-2" role="radiogroup" aria-label="Activity level">
              {ACTIVITY.map((a) => {
                const on = draft.activity === a.value
                return (
                  <button
                    key={a.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ activity: a.value })}
                    className={cn(
                      'flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition',
                      on ? 'border-primary bg-soft' : 'border-border bg-surface',
                    )}
                  >
                    <Emoji className="text-[22px]">{a.emoji}</Emoji>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{a.label}</span>
                      <span className="block text-[12.5px] text-muted">{a.hint}</span>
                    </span>
                    <span className={cn('size-5 shrink-0 rounded-full border-2', on ? 'border-primary bg-primary shadow-[inset_0_0_0_3px_var(--soft)]' : 'border-border')} />
                  </button>
                )
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Your objective</Label>
            <SegmentedControl<WeightObjective>
              label="Objective"
              value={draft.objective}
              onChange={(v) => set({ objective: v })}
              options={OBJECTIVES.map((o) => ({ value: o.value, label: o.label, icon: <Emoji>{o.emoji}</Emoji> }))}
            />
            {draft.objective === 'lose' && <p className="px-1 text-[12.5px] text-muted">About 0.5 kg a week — a gentle, sustainable pace.</p>}
            {draft.objective === 'gain' && <p className="px-1 text-[12.5px] text-muted">A small surplus, with extra protein.</p>}
          </div>
          <Button size="lg" className="w-full" disabled={save.isPending} onClick={submit}>
            {profile.data ? 'Update my targets' : 'Calculate my targets'}
          </Button>
        </Card>
      </section>
      <TargetsCard state={profile.data ?? null} fallbackGoals={fallbackGoals} />
    </>
  )
}

function TargetsCard({ state, fallbackGoals }: { state: ProfileState | null; fallbackGoals: Goals }) {
  const g = state?.targets ?? fallbackGoals
  const b = state?.breakdown
  const micros = (Object.keys(NUTRIENTS) as MicronutrientKey[]).filter((k) => g.micros[k] !== undefined)
  return (
    <section>
      <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">🎯 Your daily targets</h2>
      <p className="mb-2 mt-0.5 px-1 text-[13px] text-muted">
        {state ? 'Calculated for you — update your details above to change them.' : 'General EU reference intakes for now. Fill in your details above to personalise them.'}
      </p>
      <Card className="space-y-4">
        <div className="rounded-2xl bg-linear-to-br from-soft to-meal-lunch p-4">
          <p className="text-[12.5px] font-medium text-foreground/70">🔥 Energy</p>
          <p className="tabular text-[32px] font-semibold leading-tight tracking-tight">
            {kcal(g.calories)} <span className="text-[15px] font-medium text-muted">kcal / day</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Macro emoji="💪" label="Protein" value={`${grams(g.protein)} g`} note={b ? `${b.proteinGPerKg} g per kg` : 'at least'} />
          <Macro emoji="🍞" label="Carbs" value={`${grams(g.carbs)} g`} note={b ? `${Math.round(b.carbPercentEnergy)}% of energy` : undefined} />
          <Macro emoji="🥑" label="Fat" value={`${grams(g.fat)} g`} note={b ? `${b.fatPercentEnergy}% of energy` : undefined} />
          <Macro emoji="🌾" label="Fiber" value={`${grams(g.fiber)} g`} note="at least" />
        </div>

        {b && (
          <div className="space-y-2 rounded-2xl bg-surface-2/70 p-4 text-[13.5px] leading-relaxed">
            <p className="font-semibold">How we got there</p>
            <Step n="1">Resting energy (what your body burns at rest): <b className="tabular">{kcal(b.restingKcal)} kcal</b></Step>
            <Step n="2">
              × your activity ({b.pal}) = <b className="tabular">{kcal(b.maintenanceKcal)} kcal</b> to keep your weight
            </Step>
            {Math.round(b.adjustmentKcal) !== 0 && (
              <Step n="3">
                {b.adjustmentKcal < 0 ? '−' : '+'}
                {kcal(Math.abs(b.adjustmentKcal))} kcal for your objective = <b className="tabular">{kcal(b.energyKcal)} kcal</b>
              </Step>
            )}
            <Step n="🧪">Vitamins & minerals: {b.micronutrientReference}</Step>
          </div>
        )}

        {b && b.warnings.length > 0 && (
          <div className="space-y-1.5 rounded-2xl bg-meal-lunch p-4 text-[13px] leading-relaxed">
            {b.warnings.map((w) => (
              <p key={w}>⚠️ {w}</p>
            ))}
          </div>
        )}

        <Collapsible.Root>
          <Collapsible.Trigger className="group flex min-h-11 w-full items-center justify-between text-left text-[14px] font-semibold">
            💊 All vitamin & mineral targets
            <ChevronDown className="size-5 text-muted transition group-data-[state=open]:rotate-180" />
          </Collapsible.Trigger>
          <Collapsible.Content>
            <ul className="divide-y divide-border/70 text-[14px]">
              {micros.map((k) => (
                <li key={k} className="flex min-h-10 items-center justify-between gap-3 py-1.5">
                  <span>{NUTRIENTS[k].label}</span>
                  <span className="tabular text-muted">
                    {NUTRIENTS[k].isLimit ? 'max ' : ''}
                    {nutrientAmount(g.micros[k]!, NUTRIENTS[k].unit)}
                  </span>
                </li>
              ))}
            </ul>
          </Collapsible.Content>
        </Collapsible.Root>

        {b && (
          <Collapsible.Root>
            <Collapsible.Trigger className="group flex min-h-11 w-full items-center justify-between text-left text-[14px] font-semibold">
              📚 Sources
              <ChevronDown className="size-5 text-muted transition group-data-[state=open]:rotate-180" />
            </Collapsible.Trigger>
            <Collapsible.Content>
              <ul className="list-disc space-y-1 pl-5 text-[12.5px] leading-relaxed text-muted">
                {b.sources.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </Collapsible.Content>
          </Collapsible.Root>
        )}
        <p className="text-[12px] leading-relaxed text-muted">
          These are estimates: the equations are within about 10% for most people. If your weight doesn’t change the way you want after 2–4 weeks,
          update your details or adjust with a professional. General guidance for healthy adults, not medical advice. If you’re pregnant, breastfeeding, or managing a health condition, ask a health professional.
        </p>
      </Card>
    </section>
  )
}

function Macro({ emoji, label, value, note }: { emoji: string; label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2/70 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-muted">
        <Emoji className="text-[14px]">{emoji}</Emoji>
        {label}
      </p>
      <p className="tabular text-[19px] font-semibold tracking-tight">{value}</p>
      {note && <p className="text-[11.5px] text-muted">{note}</p>}
    </div>
  )
}

function Step({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="flex gap-2.5">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface text-[11px] font-semibold">{n}</span>
      <span>{children}</span>
    </p>
  )
}
