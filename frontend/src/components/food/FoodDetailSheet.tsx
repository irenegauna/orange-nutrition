import { Star, Trash } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { Food, LogEntry, MealType, Quantity } from '@/core/types'
import { MEAL_LABELS, TO_MEAL } from '@/lib/format'
import { useAddEntry, useDeleteEntry, useFood, useFoodPreview, useRecipesForDish, useSetFavorite, useUpdateEntry } from '@/services/queries'
import { useNavigate } from 'react-router-dom'
import { Sheet } from '../ui/sheet'
import { Button } from '../ui/button'
import { ConfirmDialog } from '../ui/dialog'
import { NutritionCard } from '../NutritionCard'
import { Skeleton } from '../ui/skeleton'
import { QuantitySelector } from './QuantitySelector'
import { MealPicker } from './MealPicker'

type Props =
  | { mode: 'add'; food: Food | null; meal: MealType; date: string; onClose: () => void; onLogged?: (e: LogEntry) => void }
  | { mode: 'edit'; entry: LogEntry | null; onClose: () => void }

/** Food detail: quantity + meal selection, live nutrition preview, save/update/delete. */
export function FoodDetailSheet(props: Props) {
  const open = props.mode === 'add' ? !!props.food : !!props.entry
  const entry = props.mode === 'edit' ? props.entry : null
  const foodQ = useFood(props.mode === 'add' ? (props.food?.id ?? null) : (entry?.foodId ?? null))
  const food = foodQ.data ?? (props.mode === 'add' ? props.food : null)

  const [quantity, setQuantity] = useState<Quantity | null>(null)
  const [meal, setMeal] = useState<MealType>('breakfast')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset state when a different food/entry opens.
  const key = props.mode === 'add' ? props.food?.id : props.entry?.id
  useEffect(() => {
    if (props.mode === 'add' && props.food) {
      setQuantity({ amount: 1, serving: props.food.servings[0] ?? { label: 'g', grams: 1 } })
      setMeal(props.meal)
    } else if (props.mode === 'edit' && props.entry) {
      setQuantity(props.entry.quantity)
      setMeal(props.entry.meal)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const q = quantity ?? { amount: 1, serving: { label: 'g', grams: 1 } }
  const preview = useFoodPreview(food?.id ?? null, q)
  const add = useAddEntry()
  const update = useUpdateEntry()
  const del = useDeleteEntry()
  const fav = useSetFavorite()
  const homeRecipe = useRecipesForDish(props.mode === 'add' ? (food?.id ?? null) : null).data?.[0]
  const navigate = useNavigate()

  const servings = food?.servings ?? (entry ? [entry.quantity.serving] : [])
  const title = food?.name ?? entry?.name ?? ''
  const subtitle = [food?.brand ?? entry?.brand, food?.attribution].filter(Boolean).join(' · ') || undefined
  const nutrition = preview.data ?? (entry && !entry.foodId ? entry.nutrition : undefined)
  const busy = add.isPending || update.isPending

  async function save() {
    if (!quantity || quantity.amount <= 0) return
    try {
      if (props.mode === 'add' && props.food) {
        const e = await add.mutateAsync({ date: props.date, meal, foodId: props.food.id, quantity })
        toast.success(`Añadido ${TO_MEAL[meal]}`)
        props.onLogged?.(e)
      } else if (entry) {
        await update.mutateAsync({ id: entry.id, meal, quantity })
        toast.success('Registro actualizado')
      }
      props.onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se ha podido guardar')
    }
  }

  async function remove() {
    if (!entry) return
    try {
      await del.mutateAsync(entry.id)
      toast.success('Registro eliminado')
      setConfirmDelete(false)
      props.onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se ha podido eliminar')
    }
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(o) => !o && props.onClose()}
        title={title}
        description={subtitle}
        footer={
          <div className="flex gap-3">
            {entry && (
              <Button variant="danger" size="icon" aria-label="Eliminar registro" onClick={() => setConfirmDelete(true)}>
                <Trash className="size-[18px]" />
              </Button>
            )}
            <Button className="flex-1" size="lg" disabled={busy || !quantity || quantity.amount <= 0} onClick={save}>
              {entry ? 'Guardar cambios' : `Añadir ${TO_MEAL[meal]}`}
            </Button>
          </div>
        }
      >
        <div className="space-y-5 pt-2">
          {nutrition ? (
            <NutritionCard nutrition={nutrition} />
          ) : (
            <Skeleton className="h-[104px] w-full rounded-2xl" />
          )}
          {entry && !entry.foodId && (
            <p className="text-[13px] text-muted">Los valores nutricionales se actualizan al guardar la nueva cantidad.</p>
          )}
          {quantity && (
            <section aria-label="Cantidad">
              <h3 className="mb-2 text-[13px] font-medium text-muted">Cantidad</h3>
              <QuantitySelector value={quantity} onChange={setQuantity} servings={servings} />
            </section>
          )}
          <section aria-label="Momento del día">
            <h3 className="mb-2 text-[13px] font-medium text-muted">Momento del día</h3>
            <MealPicker value={meal} onChange={setMeal} />
          </section>
          {homeRecipe && props.mode === 'add' && (
            <button
              type="button"
              className="flex min-h-11 w-full items-center gap-3 rounded-2xl bg-soft px-4 py-3 text-left"
              onClick={() => {
                props.onClose()
                navigate(`/add?tab=recipes&meal=${props.meal}&recipe=${encodeURIComponent(homeRecipe.id)}`)
              }}
            >
              <span aria-hidden className="emoji text-[20px]">👩‍🍳</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold">¿La haces en casa? Ver la receta</span>
                <span className="block text-[12.5px] text-muted">Estos valores son los de la tabla oficial del plato. Si lo haces distinto, personaliza la receta.</span>
              </span>
            </button>
          )}
          {food && (
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2"
              onClick={() => fav.mutate({ id: food.id, favorite: !food.isFavorite })}
              aria-pressed={!!food.isFavorite}
            >
              <Star className={food.isFavorite ? 'size-4 fill-carbs text-carbs' : 'size-4'} />
              {food.isFavorite ? 'En favoritos' : 'Añadir a favoritos'}
            </Button>
          )}
        </div>
      </Sheet>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="¿Eliminar este registro?"
        description={`${title} se eliminará de ${entry ? MEAL_LABELS[entry.meal] : 'tu diario'}.`}
        confirmLabel="Eliminar"
        destructive
        busy={del.isPending}
        onConfirm={remove}
      />
    </>
  )
}
