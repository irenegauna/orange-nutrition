import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function PageHeader({
  title,
  emoji,
  subtitle,
  eyebrow,
  actions,
  back,
  className,
}: {
  title: string
  /** Decorative emoji shown after the title (hidden from screen readers). */
  emoji?: string
  subtitle?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  back?: boolean
  className?: string
}) {
  const navigate = useNavigate()
  return (
    <header className={cn('flex items-end justify-between gap-3 pb-4 pt-2', className)}>
      <div className="min-w-0">
        {back && (
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="-ml-2 mb-1 flex h-11 items-center gap-0.5 pr-3 text-[15px] font-medium text-accent"
          >
            <ChevronLeft className="size-5" /> Atrás
          </button>
        )}
        {eyebrow && <div className="text-[13px] font-medium text-muted">{eyebrow}</div>}
        <h1 className="truncate text-[28px] font-semibold leading-tight tracking-tight">
          {title}
          {emoji && (
            <span aria-hidden className="emoji ml-2 text-[26px]">
              {emoji}
            </span>
          )}
        </h1>
        {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </header>
  )
}

export const IconButton = ({
  label,
  children,
  onClick,
  className,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  className?: string
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className={cn(
      'grid size-11 place-items-center rounded-full border border-border/70 bg-surface text-foreground transition active:scale-95',
      className,
    )}
  >
    {children}
  </button>
)
