import { zodResolver } from '@hookform/resolvers/zod'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'
import { NUTRIENTS, type MealType, type MicronutrientKey } from '@/core/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FieldError, Input, Label } from '@/components/ui/input'
import { TO_MEAL } from '@/lib/format'
import { useAddEntry, useCreateCustomFood } from '@/services/queries'

const isNum = (v: string) => v !== '' && Number.isFinite(Number(v))
const required = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label}: campo obligatorio`)
    .refine(isNum, 'Introduce un número')
    .refine((v) => Number(v) >= 0, 'Debe ser 0 o más')
    .refine((v) => Number(v) <= max, `Debe ser ${max} o menos`)
    .transform(Number)
const optional = z
  .string()
  .trim()
  .refine((v) => v === '' || (isNum(v) && Number(v) >= 0), 'Introduce un número ≥ 0')
  .transform((v) => (v === '' ? undefined : Number(v)))

const OPTIONAL_MICROS: MicronutrientKey[] = ['sugar', 'saturatedFat', 'sodium', 'potassium', 'calcium', 'iron', 'vitaminC', 'vitaminD', 'vitaminA', 'magnesium']

const schema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(80, 'Máximo 80 caracteres'),
    brand: z.string().trim().max(60),
    servingLabel: z.string().trim().min(1, 'Describe la ración').max(30),
    servingGrams: required('Peso de la ración', 5000).refine((v) => v > 0, 'Debe ser mayor que 0'),
    calories: required('Calorías', 5000),
    protein: required('Proteínas', 500),
    carbs: required('Hidratos de carbono', 500),
    fat: required('Grasas', 500),
    fiber: required('Fibra', 200),
    micros: z.object(Object.fromEntries(OPTIONAL_MICROS.map((k) => [k, optional])) as Record<MicronutrientKey, typeof optional>),
  })
  .refine((v) => v.protein + v.carbs + v.fat <= v.servingGrams + 0.5, {
    path: ['servingGrams'],
    message: 'Proteínas + hidratos + grasas superan el peso de la ración',
  })
  .refine((v) => v.fiber <= v.carbs + 0.5 || v.carbs === 0, { path: ['fiber'], message: 'La fibra suele contarse dentro de los hidratos de carbono' })

type FormIn = z.input<typeof schema>
type FormOut = z.output<typeof schema>

const emptyMicros = Object.fromEntries(OPTIONAL_MICROS.map((k) => [k, ''])) as Record<MicronutrientKey, string>

export function CustomFoodForm({ meal, date, barcode }: { meal: MealType; date: string; barcode?: string }) {
  const create = useCreateCustomFood()
  const add = useAddEntry()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', brand: '', servingLabel: '1 ración', servingGrams: '100', calories: '', protein: '', carbs: '', fat: '', fiber: '0', micros: emptyMicros },
    mode: 'onTouched',
  })

  const submit = (andLog: boolean) =>
    handleSubmit(async (v) => {
      try {
        const micros = Object.fromEntries(Object.entries(v.micros).filter(([, x]) => x !== undefined)) as Record<MicronutrientKey, number>
        const serving = { label: v.servingLabel, grams: v.servingGrams }
        const food = await create.mutateAsync({
          name: v.name,
          brand: v.brand || undefined,
          barcode,
          serving,
          perServing: { calories: v.calories, protein: v.protein, carbs: v.carbs, fat: v.fat, fiber: v.fiber, micros },
        })
        if (andLog) {
          await add.mutateAsync({ date, meal, foodId: food.id, quantity: { amount: 1, serving } })
          toast.success(`${food.name} añadido ${TO_MEAL[meal]}`)
        } else {
          toast.success(`${food.name} guardado en tus alimentos`)
        }
        reset()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se ha podido guardar el alimento')
      }
    })

  const field = (name: keyof Omit<FormIn, 'micros'>, label: string, opts: { unit?: string; numeric?: boolean; placeholder?: string } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`cf-${name}`}>{label}</Label>
      <div className="relative">
        <Input
          id={`cf-${name}`}
          inputMode={opts.numeric ? 'decimal' : undefined}
          autoComplete="off"
          placeholder={opts.placeholder}
          aria-invalid={!!errors[name]}
          className={opts.unit ? 'pr-12' : undefined}
          {...register(name)}
        />
        {opts.unit && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">{opts.unit}</span>}
      </div>
      <FieldError>{errors[name]?.message}</FieldError>
    </div>
  )

  return (
    <form onSubmit={submit(true)} noValidate className="space-y-4">
      {barcode && (
        <p className="rounded-2xl bg-soft px-4 py-3 text-sm text-accent">
          Este alimento se guardará con el código de barras <b>{barcode}</b>, así la próxima vez que lo escanees aparecerá al instante.
        </p>
      )}
      <Card className="space-y-4">
        {field('name', 'Nombre', { placeholder: 'p. ej. Granola casera' })}
        {field('brand', 'Marca (opcional)')}
        <div className="grid grid-cols-2 gap-3">
          {field('servingLabel', 'Ración', { placeholder: '1 bol' })}
          {field('servingGrams', 'Peso', { unit: 'g', numeric: true })}
        </div>
      </Card>
      <Card className="space-y-4">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-muted">
          <span aria-hidden className="emoji">🧮</span> Por ración
        </p>
        {field('calories', 'Calorías', { unit: 'kcal', numeric: true })}
        <div className="grid grid-cols-2 gap-3">
          {field('protein', 'Proteínas', { unit: 'g', numeric: true })}
          {field('carbs', 'Hidratos de carbono', { unit: 'g', numeric: true })}
          {field('fat', 'Grasas', { unit: 'g', numeric: true })}
          {field('fiber', 'Fibra', { unit: 'g', numeric: true })}
        </div>
      </Card>
      <Collapsible.Root>
        <Card className="p-0">
          <Collapsible.Trigger className="group flex min-h-14 w-full items-center justify-between px-5 text-left">
            <span>
              <span className="block text-[15px] font-semibold">
                <span aria-hidden className="emoji">💊</span> Micronutrientes
              </span>
              <span className="block text-[12.5px] text-muted">Opcional: déjalo en blanco si no lo sabes (no pongas 0)</span>
            </span>
            <ChevronDown className="size-5 text-muted transition group-data-[state=open]:rotate-180" />
          </Collapsible.Trigger>
          <Collapsible.Content className="grid grid-cols-2 gap-3 px-5 pb-5">
            {OPTIONAL_MICROS.map((k) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={`cf-m-${k}`}>{NUTRIENTS[k].label}</Label>
                <div className="relative">
                  <Input id={`cf-m-${k}`} inputMode="decimal" className="pr-11" aria-invalid={!!errors.micros?.[k]} {...register(`micros.${k}`)} />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">{NUTRIENTS[k].unit}</span>
                </div>
                <FieldError>{errors.micros?.[k]?.message}</FieldError>
              </div>
            ))}
          </Collapsible.Content>
        </Card>
      </Collapsible.Root>
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Button type="button" variant="outline" size="lg" disabled={isSubmitting} onClick={submit(false)}>
          Guardar alimento
        </Button>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          Guardar y registrar
        </Button>
      </div>
    </form>
  )
}
