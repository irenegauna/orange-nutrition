import * as D from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { Button } from './button'

/** Centered confirmation dialog (used for destructive actions). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  destructive,
  onConfirm,
  busy,
  children,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  busy?: boolean
  children?: ReactNode
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-black/35 backdrop-blur-[2px] data-[state=open]:animate-fade-up" />
        <D.Content className="fixed left-1/2 top-1/2 z-[60] w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl bg-surface p-6 shadow-xl outline-none">
          <D.Title className="text-lg font-semibold tracking-tight">{title}</D.Title>
          {description && <D.Description className="mt-1.5 text-[15px] leading-relaxed text-muted">{description}</D.Description>}
          {children}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <D.Close asChild>
              <Button variant="outline">Cancelar</Button>
            </D.Close>
            <Button
              variant={destructive ? 'danger' : 'primary'}
              disabled={busy}
              onClick={onConfirm}
              className={destructive ? 'bg-danger text-white hover:bg-danger/90' : undefined}
            >
              {confirmLabel}
            </Button>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
