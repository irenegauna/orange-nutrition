import { CalendarDays, House, Leaf, Plus, Sparkles } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/', label: 'Hoy', icon: House, end: true },
  { to: '/nutrients', label: 'Nutrientes', icon: Leaf },
  { to: '/add', label: 'Añadir comida', icon: Plus, primary: true },
  { to: '/assistant', label: 'Coach', icon: Sparkles },
  { to: '/history', label: 'Historial', icon: CalendarDays },
]

export function BottomNavigation() {
  return (
    <nav
      aria-label="Principal"
      data-bottom-nav
      className="fixed inset-x-0 bottom-0 z-40 transition-transform border-t border-border/80 bg-background/85 pb-[var(--safe-bottom)] backdrop-blur-xl backdrop-saturate-150"
    >
      <ul className="mx-auto flex h-[var(--nav-height)] max-w-lg items-stretch justify-around px-2">
        {TABS.map(({ to, label, icon: Icon, end, primary }) => (
          <li key={to} className="flex flex-1">
            <NavLink
              to={to}
              end={end}
              aria-label={label}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition-colors',
                  isActive ? 'text-accent' : 'text-muted',
                )
              }
            >
              {({ isActive }) =>
                primary ? (
                  <span
                    className={cn(
                      'grid size-13 place-items-center rounded-full bg-brand-gradient text-white shadow-[0_8px_20px_-6px_rgba(240,127,46,0.8)] transition active:scale-95 dark:text-background',
                      isActive && 'ring-4 ring-soft',
                    )}
                  >
                    <Icon className="size-6" strokeWidth={2.4} />
                  </span>
                ) : (
                  <>
                    <Icon className="size-[22px]" strokeWidth={isActive ? 2.4 : 1.9} />
                    <span>{label}</span>
                  </>
                )
              }
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
