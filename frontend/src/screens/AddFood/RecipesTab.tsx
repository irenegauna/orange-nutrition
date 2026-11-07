import { Minus, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import type { Food, MealType, Recipe, RecipeDraft, RecipeIngredient } from '@/core/types'
import { FoodListItem } from '@/components/food/FoodListItem'
import { FoodSearchInput } from '@/components/food/FoodSearchInput'
import { MealPicker } from '@/components/food/MealPicker'
import { QuantitySelector } from '@/components/food/QuantitySelector'
import { NutritionCard } from '@/components/NutritionCard'
import { RecipeCard } from '@/components/RecipeCard'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { FieldError, Input, Label } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { TO_MEAL, quantityLabel } from '@/lib/format'
import { useDeleteRecipe, useFood, useFoodSearch, useLogRecipe, useRecipeCalculation, useRecipes, useSaveRecipe } from '@/services/queries'
import { foodDetail } from './SearchTab'
import { foodEmoji } from '@/lib/emoji'

export function RecipesTab({ meal, date }: { meal: MealType; date: string }) {
  const recipes = useRecipes()
  const del = useDeleteRecipe()
  const [editing, setEditing] = useState<RecipeDraft | null>(null)
  const [logging, setLogging] = useState<Recipe | null>(null)
  const [deleting, setDeleting] = useState<Recipe | null>(null)

  if (editing) return <RecipeBuilder initial={editing} onDone={() => setEditing(null)} />

  return (
    <div className="space-y-3">
      <Button size="lg" variant="soft" className="w-full" onClick={() => setEditing({ name: '', servings: 1, ingredients: [] })}>
        <Plus className="size-5" /> Nueva receta
      </Button>
      {recipes.isError ? (
        <ErrorState error={recipes.error} onRetry={() => recipes.refetch()} />
      ) : !recipes.data ? (
        <LoadingState />
      ) : recipes.data.length === 0 ? (
        <EmptyState
          emoji="👩‍🍳"
          title="Aún no tienes recetas"
          message="Crea una receta una vez a partir de sus ingredientes y registra una ración con un toque."
        />
      ) : (
        recipes.data.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            onLog={() => setLogging(r)}
            onEdit={() => setEditing({ id: r.id, name: r.name, servings: r.servings, ingredients: r.ingredients })}
            onDelete={() => setDeleting(r)}
          />
        ))
      )}
      <LogRecipeSheet key={logging?.id ?? 'none'} recipe={logging} defaultMeal={meal} date={date} onClose={() => setLogging(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="¿Eliminar la receta?"
        description={`Se eliminará «${deleting?.name}». Lo que ya hayas registrado seguirá en tu diario.`}
        confirmLabel="Eliminar"
        destructive
        busy={del.isPending}
        onConfirm={async () => {
          if (!deleting) return
          await del.mutateAsync(deleting.id)
          toast.success('Receta eliminada')
          setDeleting(null)
        }}
      />
    </div>
  )
}

function RecipeBuilder({ initial, onDone }: { initial: RecipeDraft; onDone: () => void }) {
  const [draft, setDraft] = useState<RecipeDraft>(initial)
  const [picking, setPicking] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [nameError, setNameError] = useState<string>()
  const calc = useRecipeCalculation(draft)
  const save = useSaveRecipe()

  const setIngredient = (i: number, ing: RecipeIngredient) =>
    setDraft((d) => ({ ...d, ingredients: d.ingredients.map((x, j) => (j === i ? ing : x)) }))
  const removeIngredient = (i: number) => setDraft((d) => ({ ...d, ingredients: d.ingredients.filter((_, j) => j !== i) }))

  async function onSave() {
    if (!draft.name.trim()) {
      setNameError('Ponle un nombre a tu receta')
      return
    }
    if (!draft.ingredients.length) {
      toast.error('Añade al menos un ingrediente')
      return
    }
    try {
      await save.mutateAsync({ ...draft, name: draft.name.trim() })
      toast.success('Receta guardada')
      onDone()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se ha podido guardar la receta')
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="recipe-name">Nombre de la receta</Label>
          <Input
            id="recipe-name"
            placeholder="p. ej. Lentejas del domingo"
            value={draft.name}
            aria-invalid={!!nameError}
            onChange={(e) => {
              setNameError(undefined)
              setDraft({ ...draft, name: e.target.value })
            }}
          />
          <FieldError>{nameError}</FieldError>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-medium">Raciones</span>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              aria-label="Menos raciones"
              disabled={draft.servings <= 1}
              onClick={() => setDraft({ ...draft, servings: draft.servings - 1 })}
            >
              <Minus className="size-4" />
            </Button>
            <span className="w-8 text-center tabular text-lg font-semibold" aria-live="polite">
              {draft.servings}
            </span>
            <Button size="icon" variant="outline" aria-label="Más raciones" onClick={() => setDraft({ ...draft, servings: draft.servings + 1 })}>
              <Plus className="size-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h3 className="text-[15px] font-semibold">Ingredientes</h3>
          <Button size="sm" variant="soft" onClick={() => setPicking(true)}>
            <Plus className="size-4" /> Añadir
          </Button>
        </div>
        {draft.ingredients.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-sm text-muted">Busca y añade cada ingrediente con su cantidad.</p>
        ) : (
          <ul className="divide-y divide-border/70 px-5 pb-2">
            {draft.ingredients.map((ing, i) => (
              <li key={`${ing.foodId}-${i}`} className="flex items-center gap-2 py-2">
                <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => setEditingIdx(i)}>
                  <span className="block truncate text-[15px] font-medium">{ing.foodName}</span>
                  <span className="block text-[12.5px] text-muted">{quantityLabel(ing.quantity)} · toca para editar</span>
                </button>
                <button
                  type="button"
                  aria-label={`Quitar ${ing.foodName}`}
                  onClick={() => removeIngredient(i)}
                  className="grid size-11 place-items-center rounded-full text-muted active:bg-surface-2"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {draft.ingredients.length > 0 &&
        (calc.data ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <NutritionCard nutrition={calc.data.perServing} label="Por ración" className="bg-soft" />
            <NutritionCard nutrition={calc.data.total} label={`Receta completa · ${Math.round(calc.data.totalGrams)} g`} />
          </div>
        ) : calc.isError ? (
          <ErrorState error={calc.error} />
        ) : (
          <Skeleton className="h-28 w-full rounded-2xl" />
        ))}

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" size="lg" onClick={onDone}>
          Cancelar
        </Button>
        <Button size="lg" onClick={onSave} disabled={save.isPending}>
          Guardar receta
        </Button>
      </div>

      <IngredientPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(f) => {
          setDraft((d) => ({
            ...d,
            ingredients: [...d.ingredients, { foodId: f.id, foodName: f.name, quantity: { amount: 1, serving: f.servings[0] ?? { label: 'g', grams: 1 } } }],
          }))
          setPicking(false)
          setEditingIdx(draft.ingredients.length)
        }}
      />
      <IngredientEditor
        ingredient={editingIdx !== null ? draft.ingredients[editingIdx] : null}
        onClose={() => setEditingIdx(null)}
        onChange={(ing) => editingIdx !== null && setIngredient(editingIdx, ing)}
      />
    </div>
  )
}

function IngredientPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (f: Food) => void }) {
  const [q, setQ] = useState('')
  const results = useFoodSearch(q)
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Añadir ingrediente" className="h-[85dvh]">
      <div className="sticky top-0 z-10 bg-background pb-3">
        <FoodSearchInput onDebouncedChange={setQ} />
      </div>
      {!q ? (
        <p className="py-6 text-center text-sm text-muted">Busca un ingrediente</p>
      ) : results.isError ? (
        <ErrorState error={results.error} />
      ) : !results.data ? (
        <LoadingState />
      ) : results.data.length === 0 ? (
        <EmptyState title="Sin resultados" message="Créalo primero como alimento propio y luego añádelo aquí." />
      ) : (
        <ul className="divide-y divide-border/70">
          {results.data.map((f) => (
            <li key={f.id}>
              <FoodListItem emoji={foodEmoji(f.name, f.category)} name={f.name} detail={foodDetail(f)} calories={f.per100g.calories} onClick={() => onPick(f)} />
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

function IngredientEditor({
  ingredient,
  onClose,
  onChange,
}: {
  ingredient: RecipeIngredient | null
  onClose: () => void
  onChange: (i: RecipeIngredient) => void
}) {
  const food = useFood(ingredient?.foodId ?? null)
  return (
    <Sheet
      open={!!ingredient}
      onOpenChange={(o) => !o && onClose()}
      title={ingredient?.foodName ?? ''}
      description="Cantidad del ingrediente"
      footer={
        <Button className="w-full" size="lg" onClick={onClose}>
          Hecho
        </Button>
      }
    >
      {ingredient && (
        <QuantitySelector
          value={ingredient.quantity}
          servings={food.data?.servings ?? [ingredient.quantity.serving]}
          onChange={(quantity) => onChange({ ...ingredient, quantity })}
        />
      )}
    </Sheet>
  )
}

function LogRecipeSheet({ recipe, defaultMeal, date, onClose }: { recipe: Recipe | null; defaultMeal: MealType; date: string; onClose: () => void }) {
  const [servings, setServings] = useState(1)
  const [meal, setMeal] = useState(defaultMeal)
  const log = useLogRecipe()
  return (
    <Sheet
      open={!!recipe}
      onOpenChange={(o) => !o && onClose()}
      title={recipe ? `Registrar ${recipe.name}` : ''}
      footer={
        <Button
          className="w-full"
          size="lg"
          disabled={log.isPending || servings <= 0}
          onClick={async () => {
            if (!recipe) return
            try {
              await log.mutateAsync({ date, meal, recipeId: recipe.id, servings })
              toast.success(`Añadido ${TO_MEAL[meal]}`)
              onClose()
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'No se ha podido registrar la receta')
            }
          }}
        >
          Añadir {TO_MEAL[meal]}
        </Button>
      }
    >
      {recipe && (
        <div className="space-y-5 pt-1">
          <NutritionCard nutrition={recipe.nutrition.perServing} label="Por ración" />
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium">Raciones</span>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" aria-label="Menos raciones" disabled={servings <= 0.5} onClick={() => setServings((s) => s - 0.5)}>
                <Minus className="size-4" />
              </Button>
              <span className="w-10 text-center tabular text-lg font-semibold">{servings}</span>
              <Button size="icon" variant="outline" aria-label="Más raciones" onClick={() => setServings((s) => s + 0.5)}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          <MealPicker value={meal} onChange={setMeal} />
        </div>
      )}
    </Sheet>
  )
}
