import { Search, X } from 'lucide-react'
import { useEffect, useState } from 'react'

/** Debounced search field. Calls onDebouncedChange after typing pauses. */
export function FoodSearchInput({
  onDebouncedChange,
  autoFocus,
  placeholder = 'Buscar alimentos',
}: {
  onDebouncedChange: (q: string) => void
  autoFocus?: boolean
  placeholder?: string
}) {
  const [value, setValue] = useState('')
  useEffect(() => {
    const t = setTimeout(() => onDebouncedChange(value.trim()), 200)
    return () => clearTimeout(t)
  }, [value, onDebouncedChange])

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoFocus={autoFocus}
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-12 w-full rounded-2xl border border-border bg-surface pl-11 pr-11 text-base outline-none placeholder:text-muted/80 focus:border-primary focus:ring-4 focus:ring-primary/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => setValue('')}
          className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-muted"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
