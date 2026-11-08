import { Minus, Pencil, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import type { AiRecipeDraft, Food, MealType, Recipe, RecipeDraft, RecipeIngredient } from '@/core/types'
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
import { useAiStatus, useDeleteRecipe, useDraftRecipeWithAI, useFood, useFoodSearch, useLogRecipe, useRecipeCalculation, useRecipes, useSaveRecipe } from '@/services/queries'
import { foodDetail } from './SearchTab'
import { foodEmoji } from '@/lib/emoji'

const fold = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

type Editing = { draft: RecipeDraft; unmatched?: AiRecipeDraft['unmatched']; fromAi?: boolean }

export function RecipesTab({ meal, date }: { meal: MealType; date: string }) {
  const recipes = useRecipes()
  const del = useDeleteRecipe()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [viewing, setViewing] = useState<Recipe | null>(null)
  const [logging, setLogging] = useState<Recipe | null>(null)
  const [deleting, setDeleting] = useState<Recipe | null>(null)

  // Deep link from a food ("¿La haces en casa? Ver receta") → open that recipe.
  const linked = params.get('recipe')
  useEffect(() => {
    if (!linked || !recipes.data) return
    const r = recipes.data.find((x) => x.id === linked)
    if (r) setViewing(r)
    const next = new URLSearchParams(params)
    next.delete('recipe')
    setParams(next, { replace: true })
  }, [linked, recipes.data, params, setParams])

  const editRecipe = (r: Recipe) =>
    setEditing({ draft: { id: r.id, name: r.name, servings: r.servings, ingredients: r.ingredients, instructions: r.instructions, ...(r.dishFoodId ? { dishFoodId: r.dishFoodId } : {}) } })

  if (editing) return <RecipeBuilder initial={editing.draft} unmatched={editing.unmatched} fromAi={editing.fromAi} onDone={() => setEditing(null)} />

  const match = (r: Recipe) => !q.trim() || fold(r.name).includes(fold(q.trim())) || r.tags.some((t) => fold(t).includes(fold(q.trim())))
  const mine = recipes.data?.filter((r) => !r.builtin && match(r)) ?? []
  const classics = (recipes.data?.filter((r) => r.builtin && match(r)) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const card = (r: Recipe) => (
    <RecipeCard key={r.id} recipe={r} onOpen={() => setViewing(r)} onLog={() => setLogging(r)} onEdit={() => editRecipe(r)} onDelete={() => setDeleting(r)} />
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" variant="soft" onClick={() => setEditing({ draft: { name: '', servings: 1, ingredients: [] } })}>
          <Plus className="size-5" /> Nueva receta
        </Button>
        <Button size="lg" variant="outline" onClick={() => setAiOpen(true)}>
          <span aria-hidden className="emoji">✨</span> Con Gemini
        </Button>
      </div>
      <Input type="search" aria-label="Buscar recetas" placeholder="Buscar receta: cocido, tortilla, postre…" value={q} onChange={(e) => setQ(e.target.value)} />
      {recipes.isError ? (
        <ErrorState error={recipes.error} onRetry={() => recipes.refetch()} />
      ) : !recipes.data ? (
        <LoadingState />
      ) : mine.length === 0 && classics.length === 0 ? (
        <EmptyState
          emoji="👩‍🍳"
          title={q ? 'Ninguna receta coincide' : 'Aún no tienes recetas'}
          message={q ? 'Prueba con otro nombre o pídesela a Gemini.' : 'Crea una receta una vez a partir de sus ingredientes y registra una ración con un toque.'}
        />
      ) : (
        <>
          {mine.length > 0 && (
            <section aria-label="Mis recetas" className="space-y-3">
              <h2 className="px-1 pt-1 text-[13px] font-semibold uppercase tracking-wide text-muted">Mis recetas</h2>
              {mine.map(card)}
            </section>
          )}
          {classics.length > 0 && (
            <section aria-label="Recetas clásicas" className="space-y-3">
              <h2 className="px-1 pt-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
                <span aria-hidden className="emoji mr-1">🇪🇸</span>Recetas clásicas
              </h2>
              <p className="-mt-1 px-1 text-[12.5px] text-muted">Cantidades caseras típicas. Personalízalas a tu manera: la copia es tuya.</p>
              {classics.map(card)}
            </section>
          )}
        </>
      )}
      <RecipeDetailSheet
        recipe={viewing}
        onClose={() => setViewing(null)}
        onLog={(r) => {
          setViewing(null)
          setLogging(r)
        }}
        onEdit={(r) => {
          setViewing(null)
          editRecipe(r)
        }}
      />
      <AiRecipeSheet
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onDraft={(d) => {
          setAiOpen(false)
          setEditing({ draft: d.draft, unmatched: d.unmatched, fromAi: true })
        }}
      />
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

function RecipeDetailSheet({ recipe, onClose, onLog, onEdit }: { recipe: Recipe | null; onClose: () => void; onLog: (r: Recipe) => void; onEdit: (r: Recipe) => void }) {
  return (
    <Sheet
      open={!!recipe}
      onOpenChange={(o) => !o && onClose()}
      title={recipe?.name ?? ''}
      description={recipe ? `${recipe.servings} ${recipe.servings === 1 ? 'ración' : 'raciones'}${recipe.prepMinutes ? ` · ${recipe.prepMinutes} min` : ''}` : ''}
      className="h-[90dvh]"
      footer={
        recipe && (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="lg" onClick={() => onEdit(recipe)}>
              <Pencil className="size-4" /> {recipe.builtin ? 'Personalizar' : 'Editar'}
            </Button>
            <Button size="lg" onClick={() => onLog(recipe)}>
              Registrar
            </Button>
          </div>
        )
      }
    >
      {recipe && (
        <div className="space-y-5 pt-1">
          <NutritionCard nutrition={recipe.nutrition.perServing} label="Por ración" className="bg-soft" />
          <section aria-label="Ingredientes">
            <h3 className="mb-1 text-[15px] font-semibold">Ingredientes <span className="font-normal text-muted">· receta completa</span></h3>
            <ul className="divide-y divide-border/70">
              {recipe.ingredients.map((ing, i) => (
                <li key={`${ing.foodId}-${i}`} className="flex items-baseline gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px]">{ing.foodName}</span>
                    {ing.note && <span className="block text-[12.5px] text-muted">{ing.note}</span>}
                  </span>
                  <span className="shrink-0 tabular text-[14px] text-muted">{quantityLabel(ing.quantity)}</span>
                </li>
              ))}
            </ul>
          </section>
          {recipe.instructions.length > 0 && (
            <section aria-label="Preparación">
              <h3 className="mb-2 text-[15px] font-semibold">Preparación</h3>
              <ol className="space-y-2">
                {recipe.instructions.map((step, i) => (
                  <li key={i} className="flex gap-3 text-[14.5px] leading-snug">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-soft text-[12px] font-semibold text-accent">{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {recipe.builtin && (
            <p className="text-[12.5px] text-muted">
              Valores calculados con los ingredientes en crudo de la base de datos. Sal, agua y especias no se cuentan; del aceite de freír solo se cuenta lo que absorbe la comida.
            </p>
          )}
        </div>
      )}
    </Sheet>
  )
}

function AiRecipeSheet({ open, onClose, onDraft }: { open: boolean; onClose: () => void; onDraft: (d: AiRecipeDraft) => void }) {
  const ai = useAiStatus()
  const draft = useDraftRecipeWithAI()
  const [dish, setDish] = useState('')
  const [servings, setServings] = useState(4)
  const ready = !!ai.data?.hasApiKey && !!ai.data?.consentAccepted
  async function go() {
    if (!dish.trim()) return
    try {
      onDraft(await draft.mutateAsync({ dish: dish.trim(), servings }))
      setDish('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se ha podido crear la receta')
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Receta con Gemini"
      description="Dime el plato y te preparo un borrador con sus ingredientes. Los valores nutricionales salen de la base de datos, no de la IA."
      footer={
        ready ? (
          <Button className="w-full" size="lg" disabled={!dish.trim() || draft.isPending} onClick={go}>
            {draft.isPending ? 'Preparando…' : 'Crear borrador'}
          </Button>
        ) : (
          <Button asChild className="w-full" size="lg">
            <Link to="/settings#ai">Configurar en Ajustes</Link>
          </Button>
        )
      }
    >
      {ready ? (
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="ai-dish">Plato</Label>
            <Input
              id="ai-dish"
              placeholder="p. ej. cocido montañés, pisto sin pimiento"
              value={dish}
              onChange={(e) => setDish(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-medium">Raciones</span>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" aria-label="Menos raciones" disabled={servings <= 1} onClick={() => setServings((s) => s - 1)}>
                <Minus className="size-4" />
              </Button>
              <span className="w-8 text-center tabular text-lg font-semibold">{servings}</span>
              <Button size="icon" variant="outline" aria-label="Más raciones" onClick={() => setServings((s) => s + 1)}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="pt-1 text-[14.5px] text-muted">Para pedir recetas a Gemini, añade tu clave de API y acepta el aviso de privacidad en Ajustes.</p>
      )}
    </Sheet>
  )
}

function RecipeBuilder({ initial, unmatched, fromAi, onDone }: { initial: RecipeDraft; unmatched?: AiRecipeDraft['unmatched']; fromAi?: boolean; onDone: () => void }) {
  const [missing, setMissing] = useState(unmatched ?? [])
  const [draft, setDraft] = useState<RecipeDraft>(initial)
  /** false = closed; string = open, prefilled with that search. */
  const [picking, setPicking] = useState<false | string>(false)
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
      {fromAi && (
        <Card className="space-y-1 bg-soft">
          <p className="text-[14.5px] font-semibold"><span aria-hidden className="emoji mr-1">✨</span>Borrador de Gemini</p>
          <p className="text-[13px] text-muted">Revisa los ingredientes y las cantidades antes de guardar: son una receta típica, no la tuya.</p>
        </Card>
      )}
      {missing.length > 0 && (
        <Card className="space-y-2">
          <p className="text-[14.5px] font-semibold">No están en la base de datos</p>
          <ul className="space-y-1">
            {missing.map((m) => (
              <li key={m.name} className="flex items-center gap-2 text-[14px]">
                <span className="min-w-0 flex-1 truncate">{m.name} · {m.grams} g</span>
                <button type="button" className="min-h-11 px-2 text-[13px] font-medium text-accent" onClick={() => setPicking(m.name)}>
                  Buscar
                </button>
                <button type="button" aria-label={`Ignorar ${m.name}`} className="grid size-11 place-items-center text-muted" onClick={() => setMissing((xs) => xs.filter((x) => x !== m))}>
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
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
          <Button size="sm" variant="soft" onClick={() => setPicking('')}>
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
                  <span className="block text-[12.5px] text-muted">{quantityLabel(ing.quantity)}{ing.note ? ` · ${ing.note}` : ' · toca para editar'}</span>
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
        key={String(picking)}
        open={picking !== false}
        initialQuery={picking || ''}
        onClose={() => setPicking(false)}
        onPick={(f) => {
          if (picking) setMissing((xs) => xs.filter((x) => x.name !== picking))
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

function IngredientPicker({ open, initialQuery = '', onClose, onPick }: { open: boolean; initialQuery?: string; onClose: () => void; onPick: (f: Food) => void }) {
  const [q, setQ] = useState(initialQuery)
  const results = useFoodSearch(q)
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Añadir ingrediente" className="h-[85dvh]">
      <div className="sticky top-0 z-10 bg-background pb-3">
        <FoodSearchInput onDebouncedChange={setQ} defaultValue={initialQuery} />
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
