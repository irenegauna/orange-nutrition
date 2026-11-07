import { MEAL_TYPES, type MealType } from '@/core/types'
import { MEAL_LABELS } from '@/lib/format'
import { SegmentedControl } from '../ui/segmented'

export const MealPicker = ({ value, onChange }: { value: MealType; onChange: (m: MealType) => void }) => (
  <SegmentedControl label="Momento del día" value={value} onChange={onChange} options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_LABELS[m] }))} />
)
