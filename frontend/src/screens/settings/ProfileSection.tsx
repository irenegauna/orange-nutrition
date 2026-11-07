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
  { value: 'sedentary', emoji: '🛋️', label: 'Vida sedentaria', hint: 'Trabajo de oficina, poco ejercicio' },
  { value: 'moderate', emoji: '🚶', label: 'Actividad ligera', hint: 'Caminas, o haces ejercicio 2–3 veces por semana' },
  { value: 'active', emoji: '🚴', label: 'Activo', hint: 'Pasas mucho tiempo de pie, o haces ejercicio casi todos los días' },
  { value: 'very_active', emoji: '🏋️', label: 'Muy activo', hint: 'Trabajo físico o entrenamiento intenso a diario' },
]

const OBJECTIVES: { value: WeightObjective; label: string; emoji: string }[] = [
  { value: 'lose', label: 'Perder', emoji: '📉' },
  { value: 'maintain', label: 'Mantener', emoji: '⚖️' },
  { value: 'gain', label: 'Ganar', emoji: '📈' },
]

const FIELD_NAMES: Record<string, string> = { sex: 'sexo', age: 'edad', heightCm: 'altura', weightKg: 'peso' }

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
    // Accept "59,2", "59 kg", "1,64" (metres) etc.
    const num = (v: string) => Number(v.replace(',', '.').replace(/[^0-9.]/g, ''))
    const age = num(draft!.age)
    let height = num(draft!.heightCm)
    if (height > 0 && height < 3) height = Math.round(height * 100) // entered in metres
    const weight = num(draft!.weightKg)
    if (!draft!.sex) e.sex = 'Elige mujer u hombre'
    if (!draft!.age.trim() || !Number.isInteger(age) || age <= 0) e.age = 'Introduce tu edad en años'
    if (!(height > 0)) e.heightCm = 'Introduce tu altura en cm'
    if (!(weight > 0)) e.weightKg = 'Introduce tu peso en kg'
    setErrors(e)
    const missing = Object.keys(e) as (keyof Draft)[]
    if (missing.length) {
      toast.error(`Completa: ${missing.map((k) => FIELD_NAMES[k]).join(', ')}`)
      const first = document.querySelector<HTMLElement>(`[data-field="${missing[0]}"]`)
      first?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      first?.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true })
      return
    }
    try {
      await save.mutateAsync({ sex: draft!.sex!, age, heightCm: height, weightKg: weight, activity: draft!.activity, objective: draft!.objective })
      if (height !== num(draft!.heightCm)) setDraft({ ...draft!, heightCm: String(height) })
      toast.success('🎯 Tus objetivos diarios se han actualizado')
      setTimeout(() => document.getElementById('targets')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se ha podido guardar tu perfil')
    }
  }

  const field = (key: 'age' | 'heightCm' | 'weightKg', label: string, unit: string, placeholder: string) => (
    <div className="space-y-1.5" data-field={key}>
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
        <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">👤 Sobre ti</h2>
        <p className="mb-2 mt-0.5 px-1 text-[13px] text-muted">Con estos datos calculamos tus objetivos diarios, según las referencias de la UE y de España. Se guardan solo en este dispositivo.</p>
        <Card className="space-y-5">
          <div className="space-y-1.5" data-field="sex">
            <Label>Sexo</Label>
            <SegmentedControl<Sex | ''>
              label="Sexo"
              value={draft.sex ?? ''}
              onChange={(v) => v && set({ sex: v })}
              options={[
                { value: 'female', label: 'Mujer', icon: <Emoji>👩</Emoji> },
                { value: 'male', label: 'Hombre', icon: <Emoji>👨</Emoji> },
              ]}
            />
            <FieldError>{errors.sex}</FieldError>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {field('age', 'Edad', 'años', '30')}
            {field('heightCm', 'Altura', 'cm', '165')}
            {field('weightKg', 'Peso', 'kg', '60')}
          </div>
          <div className="space-y-2">
            <Label>¿Cuánta actividad haces?</Label>
            <div className="grid gap-2" role="radiogroup" aria-label="Nivel de actividad">
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
            <Label>Tu objetivo</Label>
            <SegmentedControl<WeightObjective>
              label="Objetivo"
              value={draft.objective}
              onChange={(v) => set({ objective: v })}
              options={OBJECTIVES.map((o) => ({ value: o.value, label: o.label, icon: <Emoji>{o.emoji}</Emoji> }))}
            />
            {draft.objective === 'lose' && <p className="px-1 text-[12.5px] text-muted">Unos 0,5 kg por semana: un ritmo suave y sostenible.</p>}
            {draft.objective === 'gain' && <p className="px-1 text-[12.5px] text-muted">Un pequeño excedente, con algo más de proteína.</p>}
          </div>
          <Button size="lg" className="w-full" disabled={save.isPending} onClick={submit}>
            {profile.data ? 'Actualizar mis objetivos' : 'Calcular mis objetivos'}
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
    <section id="targets" className="scroll-mt-4">
      <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">🎯 Tus objetivos diarios</h2>
      <p className="mb-2 mt-0.5 px-1 text-[13px] text-muted">
        {state ? 'Calculados para ti: actualiza tus datos de arriba para cambiarlos.' : 'De momento, ingestas de referencia generales de la UE. Rellena tus datos de arriba para personalizarlos.'}
      </p>
      <Card className="space-y-4">
        <div className="rounded-2xl bg-linear-to-br from-soft to-meal-lunch p-4">
          <p className="text-[12.5px] font-medium text-foreground/70">🔥 Energía</p>
          <p className="tabular text-[32px] font-semibold leading-tight tracking-tight">
            {kcal(g.calories)} <span className="text-[15px] font-medium text-muted">kcal / día</span>
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Macro emoji="💪" label="Proteínas" value={`${grams(g.protein)} g`} note={b ? `${b.proteinGPerKg.toLocaleString('es-ES')} g por kg` : 'como mínimo'} />
          <Macro emoji="🍞" label="Hidratos" value={`${grams(g.carbs)} g`} note={b ? `${Math.round(b.carbPercentEnergy)}% de la energía` : undefined} />
          <Macro emoji="🥑" label="Grasas" value={`${grams(g.fat)} g`} note={b ? `${b.fatPercentEnergy.toLocaleString('es-ES')}% de la energía` : undefined} />
          <Macro emoji="🌾" label="Fibra" value={`${grams(g.fiber)} g`} note="como mínimo" />
        </div>

        {b && (
          <div className="space-y-2 rounded-2xl bg-surface-2/70 p-4 text-[13.5px] leading-relaxed">
            <p className="font-semibold">Cómo lo calculamos</p>
            <Step n="1">Energía en reposo (lo que tu cuerpo gasta en reposo): <b className="tabular">{kcal(b.restingKcal)} kcal</b></Step>
            <Step n="2">
              × tu actividad ({b.pal.toLocaleString('es-ES')}) = <b className="tabular">{kcal(b.maintenanceKcal)} kcal</b> para mantener tu peso
            </Step>
            {Math.round(b.adjustmentKcal) !== 0 && (
              <Step n="3">
                {b.adjustmentKcal < 0 ? '−' : '+'}
                {kcal(Math.abs(b.adjustmentKcal))} kcal por tu objetivo = <b className="tabular">{kcal(b.energyKcal)} kcal</b>
              </Step>
            )}
            <Step n="🧪">Vitaminas y minerales: {b.micronutrientReference}</Step>
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
            💊 Todos los objetivos de vitaminas y minerales
            <ChevronDown className="size-5 text-muted transition group-data-[state=open]:rotate-180" />
          </Collapsible.Trigger>
          <Collapsible.Content>
            <ul className="divide-y divide-border/70 text-[14px]">
              {micros.map((k) => (
                <li key={k} className="flex min-h-10 items-center justify-between gap-3 py-1.5">
                  <span>{NUTRIENTS[k].label}</span>
                  <span className="tabular text-muted">
                    {NUTRIENTS[k].isLimit ? 'máx. ' : ''}
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
              📚 Fuentes
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
          Son estimaciones: para la mayoría de las personas, las ecuaciones aciertan con un margen de un 10 % aproximadamente. Si tu peso no cambia como
          quieres en 2–4 semanas, actualiza tus datos o ajústalo con un profesional. Son pautas generales para adultos sanos, no consejo médico. Si estás
          embarazada, en periodo de lactancia o tienes algún problema de salud, consulta a un profesional sanitario.
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
