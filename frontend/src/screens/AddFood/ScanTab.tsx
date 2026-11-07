import { WifiOff } from 'lucide-react'
import { Emoji, foodEmoji } from '@/lib/emoji'
import { useState, type FormEvent } from 'react'
import type { BarcodeResult, Food, MealType } from '@/core/types'
import { BarcodeScanner } from '@/components/BarcodeScanner'
import { FoodDetailSheet } from '@/components/food/FoodDetailSheet'
import { NutritionCard } from '@/components/NutritionCard'
import { Spinner } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input, Label, FieldError } from '@/components/ui/input'
import { useOnline } from '@/lib/useOnline'
import { useBarcodeLookup } from '@/services/queries'

export function ScanTab({ meal, date, onCreateCustom }: { meal: MealType; date: string; onCreateCustom: (code: string) => void }) {
  const [scanning, setScanning] = useState(false)
  const [manual, setManual] = useState('')
  const [manualError, setManualError] = useState<string>()
  const [result, setResult] = useState<BarcodeResult | null>(null)
  const [logging, setLogging] = useState<Food | null>(null)
  const lookup = useBarcodeLookup()
  const online = useOnline()

  async function run(code: string) {
    setScanning(false)
    setResult(null)
    try {
      const r = await lookup.mutateAsync(code)
      setResult(r)
      if (r.status === 'found') setLogging(r.food)
    } catch (err) {
      setResult({ status: 'error', barcode: code, message: err instanceof Error ? err.message : 'Error en la búsqueda' })
    }
  }

  function submitManual(e: FormEvent) {
    e.preventDefault()
    const code = manual.replace(/\s/g, '')
    if (!/^\d{6,14}$/.test(code)) {
      setManualError('Introduce los 6–14 dígitos impresos bajo el código de barras.')
      return
    }
    setManualError(undefined)
    run(code)
  }

  return (
    <div className="space-y-4">
      <Card className="flex flex-col items-center py-8 text-center">
        <div className="grid size-18 place-items-center rounded-3xl bg-linear-to-br from-soft to-meal-lunch">
          <Emoji className="text-[36px]">📷</Emoji>
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight">Escanea un código de barras</h2>
        <p className="mt-1 max-w-[30ch] text-sm text-muted">Apunta con la cámara al código de barras de un alimento envasado para ver su información nutricional.</p>
        <Button size="lg" className="mt-5 w-full max-w-xs" onClick={() => setScanning(true)} disabled={lookup.isPending}>
          Abrir cámara
        </Button>
        {!online && (
          <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
            <WifiOff className="size-3.5" /> Para buscar productos necesitas conexión a internet
          </p>
        )}
      </Card>

      <Card>
        <form onSubmit={submitManual} className="space-y-2" noValidate>
          <Label htmlFor="manual-barcode">O introduce el número</Label>
          <div className="flex gap-2">
            <Input
              id="manual-barcode"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="p. ej. 3017620422003"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              aria-invalid={!!manualError}
            />
            <Button type="submit" disabled={lookup.isPending || !manual.trim()}>
              Buscar
            </Button>
          </div>
          <FieldError>{manualError}</FieldError>
        </form>
      </Card>

      <div aria-live="polite">
        {lookup.isPending && (
          <Card className="flex items-center justify-center gap-3 py-6">
            <Spinner /> <span className="text-sm text-muted">Buscando producto…</span>
          </Card>
        )}
        {result?.status === 'found' && !lookup.isPending && (
          <Card className="space-y-4">
            <div>
              <p className="text-[12.5px] font-medium text-muted">Encontrado · {result.food.barcode}</p>
              <h3 className="text-lg font-semibold tracking-tight">
                <Emoji>{foodEmoji(result.food.name, result.food.category)}</Emoji> {result.food.name}
              </h3>
              {result.food.brand && <p className="text-sm text-muted">{result.food.brand}</p>}
            </div>
            <NutritionCard nutrition={result.food.per100g} label="Por 100 g" />
            <Button className="w-full" onClick={() => setLogging(result.food)}>
              Elegir cantidad y registrar
            </Button>
          </Card>
        )}
        {result?.status === 'not_found' && (
          <Card className="flex flex-col items-center py-7 text-center">
            <Emoji className="text-[36px]">🤷</Emoji>
            <p className="mt-3 font-semibold">Producto no encontrado</p>
            <p className="mt-1 max-w-[30ch] text-sm text-muted">
              El código {result.barcode} aún no está en la base de datos. Puedes añadirlo como alimento propio.
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => setScanning(true)}>
                Escanear de nuevo
              </Button>
              <Button onClick={() => onCreateCustom(result.barcode)}>Crear alimento propio</Button>
            </div>
          </Card>
        )}
        {result?.status === 'error' && (
          <Card className="flex flex-col items-center bg-danger/5 py-7 text-center" role="alert">
            <p className="font-semibold">Error en la búsqueda</p>
            <p className="mt-1 max-w-[32ch] text-sm text-muted">{result.message}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => run(result.barcode)}>
                Reintentar
              </Button>
              <Button variant="soft" onClick={() => onCreateCustom(result.barcode)}>
                Introducir a mano
              </Button>
            </div>
          </Card>
        )}
      </div>

      {scanning && (
        <BarcodeScanner
          onDetected={run}
          onClose={() => setScanning(false)}
          onManual={() => {
            setScanning(false)
            setTimeout(() => document.getElementById('manual-barcode')?.focus(), 50)
          }}
        />
      )}
      <FoodDetailSheet mode="add" food={logging} meal={meal} date={date} onClose={() => setLogging(null)} />
    </div>
  )
}
