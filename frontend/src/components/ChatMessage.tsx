import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function ChatMessage({ role, children }: { role: 'user' | 'assistant'; children: ReactNode }) {
  const mine = role === 'user'
  return (
    <div className={cn('flex animate-fade-up gap-2', mine ? 'justify-end' : 'justify-start')}>
      {!mine && (
        <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-soft to-meal-lunch" aria-hidden>
          <span className="emoji text-[18px]">🍊</span>
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] rounded-[22px] px-4 py-2.5 text-[15px] leading-relaxed',
          mine ? 'rounded-br-md bg-brand-gradient font-medium text-[#3a1a05]' : 'rounded-bl-md border border-border/70 bg-surface',
        )}
      >
        <span className="sr-only">{mine ? 'Has dicho: ' : 'Coach: '}</span>
        {children}
      </div>
    </div>
  )
}

export function TypingIndicator() {
  return (
    <div className="flex gap-2" role="status" aria-label="El coach está pensando">
      <div className="grid size-9 place-items-center rounded-full bg-linear-to-br from-soft to-meal-lunch">
        <span aria-hidden className="emoji text-[18px]">🍊</span>
      </div>
      <div className="flex items-center gap-1 rounded-[22px] rounded-bl-md border border-border/70 bg-surface px-4 py-3.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-1.5 animate-shimmer rounded-full bg-muted" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </div>
    </div>
  )
}
