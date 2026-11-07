import { WifiOff } from 'lucide-react'
import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useOnline } from '@/lib/useOnline'
import { BottomNavigation } from './BottomNavigation'

export function OfflineIndicator() {
  const online = useOnline()
  if (online) return null
  return (
    <div className="flex items-center justify-center gap-1.5 bg-surface-2 px-4 py-1.5 text-[11.5px] font-medium text-muted" role="status">
      <WifiOff className="size-3.5" />
      Sin conexión: tu diario sigue funcionando; para buscar códigos de barras necesitas conexión
    </div>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  return (
    <div className="min-h-dvh">
      <div className="sticky top-0 z-30 pt-[var(--safe-top)] bg-background/85 backdrop-blur-xl">
        <OfflineIndicator />
      </div>
      <main className="mx-auto w-full max-w-lg px-4 pb-[calc(var(--nav-height)+var(--safe-bottom)+28px)] sm:px-6 lg:max-w-2xl">
        <Outlet />
      </main>
      <BottomNavigation />
    </div>
  )
}
