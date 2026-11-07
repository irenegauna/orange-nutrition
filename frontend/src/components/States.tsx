import { CircleExclamationPoint, LoaderCircle, WifiOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Skeleton } from './ui/skeleton'
import { Button } from './ui/button'
import { isStorageUnavailable } from '@/services'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon,
  emoji,
  title,
  message,
  action,
  className,
}: {
  icon?: ReactNode
  emoji?: string
  title: string
  message?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-8 text-center', className)}>
      {emoji ? (
        <div className="mb-3 grid size-16 place-items-center rounded-3xl bg-soft">
          <span aria-hidden className="emoji text-[32px]">{emoji}</span>
        </div>
      ) : (
        icon && <div className="mb-3 grid size-12 place-items-center rounded-full bg-soft text-accent">{icon}</div>
      )}
      <p className="text-[15px] font-semibold">{title}</p>
      {message && <p className="mt-1 max-w-[30ch] text-sm leading-relaxed text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function LoadingState({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-2xl" />
      ))}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-5 animate-spin text-muted', className)} aria-label="Cargando" />
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const unavailable = isStorageUnavailable(error)
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  const message = unavailable
    ? 'Este navegador no deja que la app guarde datos aquí (¿navegación privada?). Ábrela en una pestaña normal de Safari o instálala en la pantalla de inicio.'
    : error instanceof Error
      ? error.message
      : 'Algo ha ido mal.'
  return (
    <div className={cn('flex flex-col items-center rounded-3xl bg-danger/5 px-6 py-8 text-center', className)} role="alert">
      <div className="mb-3 grid size-12 place-items-center rounded-full bg-danger/10 text-danger">
        {offline ? <WifiOff className="size-5" /> : <CircleExclamationPoint className="size-5" />}
      </div>
      <p className="text-[15px] font-semibold">{unavailable ? 'Almacenamiento no disponible' : 'No se ha podido cargar'}</p>
      <p className="mt-1 max-w-[32ch] text-sm leading-relaxed text-muted">{message}</p>
      {onRetry && !unavailable && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  )
}
