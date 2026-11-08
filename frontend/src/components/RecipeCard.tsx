import { Pencil, Trash } from 'lucide-react'
import type { Recipe } from '@/core/types'
import { grams, kcal } from '@/lib/format'
import { foodEmoji } from '@/lib/emoji'
import { Card } from './ui/card'
import { Button } from './ui/button'

export function RecipeCard({
  recipe,
  onOpen,
  onLog,
  onEdit,
  onDelete,
}: {
  recipe: Recipe
  onOpen?: () => void
  onLog: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const n = recipe.nutrition.perServing
  return (
    <Card className="space-y-3">
      <button type="button" className="flex w-full items-start gap-3 text-left" onClick={onOpen} disabled={!onOpen} aria-label={`Ver receta: ${recipe.name}`}>
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-meal-dinner">
          <span aria-hidden className="emoji text-[22px]">{foodEmoji(recipe.name, 'recipe')}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold tracking-tight">{recipe.name}</h3>
          <p className="text-[12.5px] text-muted">
            {recipe.ingredients.length} ingrediente{recipe.ingredients.length === 1 ? '' : 's'} · {recipe.servings} {recipe.servings === 1 ? 'ración' : 'raciones'}
            {recipe.prepMinutes ? ` · ${recipe.prepMinutes} min` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular text-[17px] font-semibold">{kcal(n.calories)}</p>
          <p className="text-[11.5px] text-muted">kcal / ración</p>
        </div>
      </button>
      <p className="text-[12.5px] text-muted tabular">
        Proteínas {grams(n.protein)} g · Hidratos {grams(n.carbs)} g · Grasas {grams(n.fat)} g · Fibra {grams(n.fiber)} g
      </p>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={onLog}>
          Registrar
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit} aria-label={`Editar ${recipe.name}`}>
          <Pencil className="size-4" /> {recipe.builtin ? 'Personalizar' : 'Editar'}
        </Button>
        <Button size="sm" variant="danger" onClick={onDelete} aria-label={`Eliminar ${recipe.name}`}>
          <Trash className="size-4" />
        </Button>
      </div>
    </Card>
  )
}
