import { ArrowUp, Images, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import type { Food, MealType, PhotoAnalysis } from '@/core/types'
import { FoodListItem } from '@/components/food/FoodListItem'
import { FoodSearchInput } from '@/components/food/FoodSearchInput'
import { MealPicker } from '@/components/food/MealPicker'
import { NutritionCard } from '@/components/NutritionCard'
import { EmptyState, ErrorState, LoadingState, Spinner } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Emoji, foodEmoji } from '@/lib/emoji'
import { capitalize } from '@/lib/dates'
import { TO_MEAL, kcal } from '@/lib/format'
import { cn } from '@/lib/utils'
import { api } from '@/services'
import { useAiStatus, useAnalyzePhoto, useRefinePhoto, useFoodPreview, useFoodSearch, useLogPhotoMeal, usePhotoTotals, useSetPhotoEnabled } from '@/services/queries'

interface ItemState {
  id: string
  name: string
  confidence: number
  matches: Food[]
  foodId: string | null
  grams: number
  /** The user chose this food themselves — a Gemini correction must not overwrite it. */
  userPicked?: boolean
}

const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** Apply Gemini's corrected list, keeping foods the user picked by hand for items that are still there. */
function mergeCorrection(prev: ItemState[], next: PhotoAnalysis['items']): ItemState[] {
  return next.map((n) => {
    const old = prev.find((p) => norm(p.name) === norm(n.name))
    const keepPick = old?.userPicked && old.foodId ? old : null
    const picked = keepPick ? old!.matches.find((m) => m.id === old!.foodId) : undefined
    return {
      id: n.id,
      name: n.name,
      confidence: n.confidence,
      matches: picked && !n.matches.some((m) => m.id === picked.id) ? [picked, ...n.matches] : n.matches,
      foodId: keepPick ? keepPick.foodId : n.selectedFoodId,
      grams: Math.max(1, Math.round(n.estimatedGrams)),
      ...(keepPick ? { userPicked: true } : {}),
    }
  })
}

const GRAM = { label: 'g', grams: 1 }

/** Take/choose a meal photo → Gemini names the foods → user confirms matches & grams → log. */
export function PhotoTab({ meal: initialMeal, date }: { meal: MealType; date: string }) {
  const status = useAiStatus()
  const setPhoto = useSetPhotoEnabled()
  const analyze = useAnalyzePhoto()
  const navigate = useNavigate()
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [hint, setHint] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<PhotoAnalysis | null>(null)
  const [items, setItems] = useState<ItemState[]>([])
  const [meal, setMeal] = useState<MealType>(initialMeal)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Elige una foto')
      return
    }
    setError(null)
    setResult(null)
    setPreview(URL.createObjectURL(file))
    try {
      const r = await analyze.mutateAsync({ image: file, meal, hint })
      setResult(r)
      setItems(
        r.items.map((i) => ({
          id: i.id,
          name: i.name,
          confidence: i.confidence,
          matches: i.matches,
          foodId: i.selectedFoodId,
          grams: Math.max(1, Math.round(i.estimatedGrams)),
        })),
      )
    } catch (err) {
      setError(err)
    }
  }

  function reset() {
    if (result?.photoId) void api.photo.discard(result.photoId).catch(() => {})
    setResult(null)
    setItems([])
    setError(null)
    setPreview(null)
  }

  const pickers = (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </>
  )

  // ── AI not set up ──
  if (status.isError) return <ErrorState error={status.error} onRetry={() => status.refetch()} />
  if (!status.data) return <LoadingState rows={2} />
  const s = status.data
  if (!s.photoAvailable) {
    const ready = s.hasApiKey && s.consentAccepted
    return (
      <Card>
        <EmptyState
          emoji="📸"
          title="Registra una comida con una foto"
          message={
            ready
              ? 'Activa el reconocimiento de fotos para que Gemini identifique los alimentos de tu plato. Tú lo confirmas todo antes de registrarlo.'
              : 'Haz una foto a tu plato y Gemini identifica los alimentos y estima las raciones; los valores nutricionales salen de la base de datos de alimentos. Necesitas tu propia clave de API de Gemini (gratuita).'
          }
          action={
            ready ? (
              <Button disabled={setPhoto.isPending} onClick={() => setPhoto.mutate(true, { onSuccess: () => toast.success('Reconocimiento de fotos activado 📸') })}>
                Activar reconocimiento de fotos
              </Button>
            ) : (
              <Button onClick={() => navigate('/settings#ai')}>Configurar en Ajustes</Button>
            )
          }
        />
      </Card>
    )
  }

  // ── Analysing ──
  if (analyze.isPending) {
    return (
      <Card className="space-y-4">
        {preview && <img src={preview} alt="Tu comida" className="aspect-[4/3] w-full animate-shimmer rounded-2xl object-cover" />}
        <div className="flex items-center justify-center gap-3 py-2" role="status">
          <Spinner /> <span className="text-[15px] text-muted">Reconociendo tu comida… 🤖</span>
        </div>
      </Card>
    )
  }

  // ── Error ──
  if (error) {
    return (
      <div className="space-y-3">
        <ErrorState error={error} />
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" onClick={reset}>
            Probar con otra foto
          </Button>
          <Button variant="soft" onClick={() => navigate('/add?tab=search')}>
            Buscar en su lugar
          </Button>
        </div>
        {pickers}
      </div>
    )
  }

  // ── Review ──
  if (result) {
    if (!result.isFood || items.length === 0) {
      return (
        <Card className="space-y-4">
          {preview && <img src={preview} alt="Tu foto" className="aspect-[4/3] w-full rounded-2xl object-cover" />}
          <EmptyState emoji="🤔" title="No he encontrado ningún alimento" message={result.description || 'Prueba con una foto más cercana y con buena luz del plato.'} />
          <Button className="w-full" onClick={reset}>
            <RotateCcw className="size-4" /> Probar con otra foto
          </Button>
        </Card>
      )
    }
    return (
      <PhotoReview
        preview={preview}
        result={result}
        setResult={setResult}
        items={items}
        setItems={setItems}
        meal={meal}
        setMeal={setMeal}
        date={date}
        onRetake={reset}
        onLogged={() => navigate('/')}
      />
    )
  }

  // ── Start ──
  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-center py-8 text-center">
        <div className="grid size-18 place-items-center rounded-3xl bg-linear-to-br from-soft to-meal-lunch">
          <Emoji className="text-[36px]">📸</Emoji>
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">Haz una foto a tu comida</h2>
        <p className="mt-1 max-w-[32ch] text-sm text-muted">
          Gemini identifica los alimentos y calcula las raciones a ojo. Los valores nutricionales siempre salen de la base de datos de alimentos y tú confirmas antes de registrar nada.
        </p>
        <div className="mt-5 grid w-full max-w-xs gap-2">
          <Button size="lg" onClick={() => cameraRef.current?.click()}>
            📷 Hacer foto
          </Button>
          <Button size="lg" variant="outline" onClick={() => libraryRef.current?.click()}>
            <Images className="size-4" /> Elegir de la galería
          </Button>
        </div>
      </Card>
      <Card className="space-y-1.5">
        <Label htmlFor="photo-hint">¿Algo que no se vea en la foto? (opcional)</Label>
        <Input id="photo-hint" placeholder="p. ej. sin aliñar, hecho con aceite de oliva" maxLength={120} value={hint} onChange={(e) => setHint(e.target.value)} />
      </Card>
      <p className="px-2 text-center text-[12px] leading-relaxed text-muted">
        La foto se reduce en tu móvil y se envía a Google Gemini ({s.model}). En el plan gratuito, Google puede usarla para mejorar sus productos.
      </p>
      {pickers}
    </div>
  )
}

function PhotoReview({
  preview,
  result,
  setResult,
  items,
  setItems,
  meal,
  setMeal,
  date,
  onRetake,
  onLogged,
}: {
  preview: string | null
  result: PhotoAnalysis
  setResult: (r: PhotoAnalysis) => void
  items: ItemState[]
  setItems: React.Dispatch<React.SetStateAction<ItemState[]>>
  meal: MealType
  setMeal: (m: MealType) => void
  date: string
  onRetake: () => void
  onLogged: () => void
}) {
  const [searchFor, setSearchFor] = useState<string | null>(null)
  const [turns, setTurns] = useState<{ role: 'user' | 'ai'; text: string }[]>([])
  const [feedback, setFeedback] = useState('')
  const refine = useRefinePhoto()
  const feedbackRef = useRef<HTMLInputElement>(null)
  const log = useLogPhotoMeal()
  const confirmed = useMemo(() => items.flatMap((i) => (i.foodId && i.grams > 0 ? [{ foodId: i.foodId, grams: i.grams }] : [])), [items])
  const totals = usePhotoTotals(confirmed)
  const unmatched = items.filter((i) => !i.foodId).length
  const update = (id: string, patch: Partial<ItemState>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)))

  async function sendFeedback(e?: React.FormEvent) {
    e?.preventDefault()
    const text = feedback.trim()
    if (!text || refine.isPending) return
    if (!result.photoId) {
      toast.error('Esta foto no se guardó; haz otra para poder corregirla')
      return
    }
    setFeedback('')
    setTurns((t) => [...t, { role: 'user', text }])
    try {
      const r = await refine.mutateAsync({
        photoId: result.photoId,
        feedback: text,
        current: items.map((i) => ({ name: i.name, grams: i.grams })),
        previousFeedback: turns.filter((t) => t.role === 'user').map((t) => t.text),
        meal,
      })
      setItems((prev) => mergeCorrection(prev, r.items))
      setResult({ ...result, ...r, photoId: result.photoId })
      setTurns((t) => [...t, { role: 'ai', text: r.reply || 'Hecho, he actualizado la lista.' }])
    } catch (err) {
      setTurns((t) => t.slice(0, -1))
      setFeedback(text)
      toast.error(err instanceof Error ? err.message : 'No se ha podido aplicar la corrección')
    }
  }

  async function submit() {
    try {
      await log.mutateAsync({ date, meal, photoId: result.photoId, items: confirmed })
      toast.success(`${confirmed.length} alimento${confirmed.length > 1 ? 's añadidos' : ' añadido'} ${TO_MEAL[meal]} 📸`)
      onLogged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se ha podido registrar la comida')
    }
  }

  return (
    <div className="space-y-4">
      <Card className="flex gap-4 p-4">
        {preview && <img src={preview} alt="Tu comida" className="size-20 shrink-0 rounded-2xl object-cover" />}
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-muted">✨ Gemini ha visto</p>
          <p className="text-[15px] leading-snug">{result.description || `${items.length} alimento${items.length > 1 ? 's' : ''}`}</p>
          <button type="button" onClick={onRetake} className="mt-1 inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-accent">
            <RotateCcw className="size-3.5" /> Repetir
          </button>
        </div>
      </Card>

      <Card className="space-y-3 p-4" aria-label="Corregir a Gemini">
        <p className="text-[14.5px] font-semibold">💬 ¿Algo no está bien? Díselo a Gemini</p>
        {turns.length > 0 && (
          <ul className="space-y-2" aria-live="polite">
            {turns.map((t, i) => (
              <li key={i} className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
                <span
                  className={cn(
                    'max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug',
                    t.role === 'user' ? 'rounded-br-md bg-brand-gradient font-medium text-[#3a1a05]' : 'rounded-bl-md bg-surface-2',
                  )}
                >
                  {t.role === 'ai' && <span aria-hidden className="emoji mr-1">✨</span>}
                  {t.text}
                </span>
              </li>
            ))}
          </ul>
        )}
        {refine.isPending && (
          <p className="flex items-center gap-2 text-[13px] text-muted" role="status">
            <Spinner className="size-4" /> Gemini está corrigiendo la lista…
          </p>
        )}
        {turns.length === 0 && (
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
            {[
              ['Te has dejado algo', 'Te has dejado '],
              ['Esto no es…', 'No es '],
              ['La ración era más pequeña', 'La ración era más pequeña'],
              ['Quita algo', 'Quita '],
            ].map(([ex, prefill]) => (
              <button
                key={ex}
                type="button"
                onClick={() => {
                  setFeedback(prefill!)
                  feedbackRef.current?.focus()
                }}
                className="h-9 shrink-0 rounded-full border border-border bg-surface px-3.5 text-[12.5px] font-medium"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={sendFeedback} className="flex items-center gap-2">
          <label htmlFor="photo-feedback" className="sr-only">
            Corrección para Gemini
          </label>
          <input
            ref={feedbackRef}
            id="photo-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Ej.: te has dejado el huevo frito"
            maxLength={300}
            enterKeyHint="send"
            autoComplete="off"
            className="h-11 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-base outline-none placeholder:text-muted/80 focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
          <Button type="submit" size="icon" aria-label="Enviar corrección" disabled={!feedback.trim() || refine.isPending}>
            <ArrowUp className="size-5" />
          </Button>
        </form>
      </Card>

      <p className="rounded-2xl bg-meal-lunch px-4 py-3 text-[13px] leading-relaxed text-foreground/80">
        ⚖️ Las raciones son estimaciones a ojo. Revisa cada peso y cada alimento antes de registrar.
      </p>

      <ul className="space-y-3">
        {items.map((item) => (
          <PhotoItemCard
            key={item.id}
            item={item}
            onChange={(patch) => update(item.id, patch)}
            onRemove={() => setItems((list) => list.filter((i) => i.id !== item.id))}
            onSearch={() => setSearchFor(item.id)}
          />
        ))}
      </ul>

      {confirmed.length > 0 &&
        (totals.data ? (
          <NutritionCard nutrition={totals.data} label={`Total · ${confirmed.length} alimento${confirmed.length > 1 ? 's' : ''}`} className="bg-soft" />
        ) : (
          <Skeleton className="h-28 w-full rounded-2xl" />
        ))}

      <MealPicker value={meal} onChange={setMeal} />
      {unmatched > 0 && (
        <p className="text-center text-[12.5px] text-muted">
          {unmatched > 1 ? `${unmatched} alimentos sin coincidencia no se registrarán: búscalos o quítalos.` : '1 alimento sin coincidencia no se registrará: búscalo o quítalo.'}
        </p>
      )}
      <Button size="lg" className="w-full" disabled={confirmed.length === 0 || log.isPending} onClick={submit}>
        Añadir {confirmed.length || ''} alimento{confirmed.length === 1 ? '' : 's'} {TO_MEAL[meal]}
      </Button>

      <FoodPickerSheet
        open={!!searchFor}
        initialQuery={items.find((i) => i.id === searchFor)?.name ?? ''}
        onClose={() => setSearchFor(null)}
        onPick={(food) => {
          setItems((list) =>
            list.map((i) =>
              i.id === searchFor ? { ...i, foodId: food.id, userPicked: true, matches: [food, ...i.matches.filter((m) => m.id !== food.id)] } : i,
            ),
          )
          setSearchFor(null)
        }}
      />
    </div>
  )
}

function PhotoItemCard({
  item,
  onChange,
  onRemove,
  onSearch,
}: {
  item: ItemState
  onChange: (p: Partial<ItemState>) => void
  onRemove: () => void
  onSearch: () => void
}) {
  const food = item.matches.find((m) => m.id === item.foodId) ?? null
  const preview = useFoodPreview(item.foodId, { amount: item.grams, serving: GRAM })
  const setGrams = (g: number) => onChange({ grams: Math.max(0, Math.round(g)) })
  const pct = Math.round(item.confidence * 100)

  return (
    <li>
      <Card className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface-2">
            <Emoji className="text-[22px]">{foodEmoji(food?.name ?? item.name, food?.category)}</Emoji>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15.5px] font-semibold leading-snug">{capitalize(item.name)}</p>
            <p className={cn('text-[12px] font-medium', pct >= 70 ? 'text-sage' : pct >= 40 ? 'text-warning' : 'text-danger')}>
              {pct >= 70 ? 'Bastante seguro' : pct >= 40 ? 'No muy seguro' : 'Poco seguro'} · {pct}%
            </p>
          </div>
          <button type="button" aria-label={`Quitar ${item.name}`} onClick={onRemove} className="grid size-11 place-items-center rounded-full text-muted active:bg-surface-2">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`match-${item.id}`}>Alimento en la base de datos</Label>
          {item.matches.length > 0 ? (
            <select
              id={`match-${item.id}`}
              value={item.foodId ?? ''}
              onChange={(e) => (e.target.value === '__search' ? onSearch() : onChange({ foodId: e.target.value || null, userPicked: true }))}
              className="h-12 w-full rounded-2xl border border-border bg-surface px-4 text-base outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
            >
              {!item.foodId && <option value="">Elige una coincidencia…</option>}
              {item.matches.slice(0, 6).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.brand ? ` (${m.brand})` : ''}
                </option>
              ))}
              <option value="__search">🔍 Buscar otro…</option>
            </select>
          ) : (
            <Button variant="soft" className="w-full" onClick={onSearch}>
              🔍 Sin coincidencia: busca en la base de datos
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-1 items-center gap-1 rounded-2xl bg-surface-2 p-1">
            <button type="button" aria-label={`Menos gramos de ${item.name}`} onClick={() => setGrams(item.grams - 10)} className="grid size-11 place-items-center rounded-xl bg-surface shadow-sm">
              <Minus className="size-4" />
            </button>
            <label className="flex flex-1 items-baseline justify-center gap-1">
              <span className="sr-only">Gramos de {item.name}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={item.grams}
                onChange={(e) => setGrams(Number(e.target.value))}
                className="w-16 bg-transparent text-center text-[20px] font-semibold outline-none tabular"
              />
              <span className="text-sm text-muted">g</span>
            </label>
            <button type="button" aria-label={`Más gramos de ${item.name}`} onClick={() => setGrams(item.grams + 10)} className="grid size-11 place-items-center rounded-xl bg-surface shadow-sm">
              <Plus className="size-4" />
            </button>
          </div>
          <div className="w-20 text-right">
            {item.foodId ? (
              preview.data ? (
                <>
                  <p className="tabular text-[17px] font-semibold">{kcal(preview.data.calories)}</p>
                  <p className="text-[11.5px] text-muted">kcal</p>
                </>
              ) : (
                <Skeleton className="ml-auto h-8 w-14" />
              )
            ) : (
              <p className="text-[12px] text-muted">—</p>
            )}
          </div>
        </div>
      </Card>
    </li>
  )
}

function FoodPickerSheet({
  open,
  initialQuery,
  onClose,
  onPick,
}: {
  open: boolean
  initialQuery: string
  onClose: () => void
  onPick: (f: Food) => void
}) {
  const [q, setQ] = useState('')
  const results = useFoodSearch(q)
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Busca el alimento correcto" description={initialQuery ? `Gemini lo ha llamado «${initialQuery}»` : undefined} className="h-[85dvh]">
      <div className="sticky top-0 z-10 bg-background pb-3">
        <FoodSearchInput key={initialQuery} onDebouncedChange={setQ} placeholder="Buscar alimentos" />
      </div>
      {!q ? (
        <p className="py-6 text-center text-sm text-muted">Escribe el nombre de un alimento 🔍</p>
      ) : !results.data ? (
        <LoadingState />
      ) : results.data.length === 0 ? (
        <EmptyState emoji="🔎" title="Sin resultados" message="Prueba con una palabra más sencilla o créalo como alimento propio." />
      ) : (
        <ul className="divide-y divide-border/70">
          {results.data.map((f) => (
            <li key={f.id}>
              <FoodListItem emoji={foodEmoji(f.name, f.category)} name={f.name} detail={[f.brand, 'por 100 g'].filter(Boolean).join(' · ')} calories={f.per100g.calories} onClick={() => onPick(f)} />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
