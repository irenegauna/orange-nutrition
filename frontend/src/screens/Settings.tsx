import { Download, ExternalLink, KeyRound, Monitor, Moon, Share, Sparkles, Sun, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ProfileSection } from './settings/ProfileSection'
import { ALLERGENS, type BackupValidation, type Preferences, type ThemePreference } from '@/core/types'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState, LoadingState } from '@/components/States'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input, Label } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'
import { api } from '@/services'
import {
  useAcceptAiNotice,
  useAiStatus,
  useGoals,
  useImportBackup,
  usePreferences,
  useRevokeAi,
  useSetAiKey,
  useSetAssistantEnabled,
  useSetPhotoEnabled,
  useTestAi,
  useUpdatePreferences,
} from '@/services/queries'

export function SettingsScreen() {
  const goals = useGoals()
  const prefs = usePreferences()
  return (
    <div className="animate-fade-up pb-4">
      <PageHeader title="Ajustes" emoji="⚙️" back />
      {goals.isError || prefs.isError ? (
        <ErrorState error={goals.error ?? prefs.error} onRetry={() => (goals.refetch(), prefs.refetch())} />
      ) : !goals.data || !prefs.data ? (
        <LoadingState rows={5} />
      ) : (
        <div className="space-y-6">
          <ProfileSection fallbackGoals={goals.data} />
          <AiSection />
          <PreferencesSection prefs={prefs.data} />
          <ThemeSection prefs={prefs.data} />
          <DataSection />
          <InstallSection />
        </div>
      )}
    </div>
  )
}

function Group({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-4">
      <h2 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {description && <p className="mb-2 mt-0.5 px-1 text-[13px] text-muted">{description}</p>}
      <Card className={cn('space-y-4', !description && 'mt-2')}>{children}</Card>
    </section>
  )
}

/** Ids are stored in preferences (and read by the backend) — keep them in English. */
const DIETS: { id: string; label: string }[] = [
  { id: 'vegetarian', label: 'Vegetariana' },
  { id: 'vegan', label: 'Vegana' },
  { id: 'pescatarian', label: 'Pescetariana' },
  { id: 'gluten-free', label: 'Sin gluten' },
  { id: 'dairy-free', label: 'Sin lácteos' },
]

function PreferencesSection({ prefs }: { prefs: Preferences }) {
  const update = useUpdatePreferences()
  const [draft, setDraft] = useState(prefs)
  useEffect(() => {
    setDraft((d) => ({ ...d, theme: prefs.theme }))
  }, [prefs.theme])
  const dirty = JSON.stringify({ ...draft, theme: null }) !== JSON.stringify({ ...prefs, theme: null })

  const toggleDiet = (k: string) => {
    setDraft({ ...draft, dietary: draft.dietary.includes(k) ? draft.dietary.filter((x) => x !== k) : [...draft.dietary, k] })
  }

  return (
    <Group title="🥗 Preferencias alimentarias" description="Se usan para filtrar las recomendaciones.">
      <div className="space-y-1.5">
        <Label htmlFor="pref-name">Tu nombre (para el saludo)</Label>
        <Input id="pref-name" value={draft.displayName ?? ''} maxLength={30} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
      </div>
      <div>
        <p className="mb-2 text-[13px] font-medium text-muted">Tipo de dieta</p>
        <div className="flex flex-wrap gap-2">
          {DIETS.map((d) => {
            const on = draft.dietary.includes(d.id)
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDiet(d.id)}
                className={cn(
                  'h-10 rounded-full border px-4 text-[13px] font-medium transition',
                  on ? 'border-accent bg-accent text-white dark:text-background' : 'border-border bg-surface',
                )}
              >
                {d.label}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[13px] font-medium text-muted">Alergias</p>
        <p className="mb-2 text-[12px] text-muted">Los 14 alérgenos de la UE. Si marcas alguno, se excluyen los alimentos sin información de alérgenos confirmada.</p>
        <div className="flex flex-wrap gap-2">
          {ALLERGENS.map((a) => {
            const on = draft.allergies.includes(a.id)
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setDraft({ ...draft, allergies: on ? draft.allergies.filter((x) => x !== a.id) : [...draft.allergies, a.id] })
                }
                className={cn(
                  'h-10 rounded-full border px-4 text-[13px] font-medium transition',
                  on ? 'border-danger bg-danger text-white' : 'border-border bg-surface',
                )}
              >
                {a.label}
              </button>
            )
          })}
        </div>
      </div>
      <ChipInput label="Alimentos que no te gustan" placeholder="p. ej. aceitunas" values={draft.dislikedFoods} onChange={(dislikedFoods) => setDraft({ ...draft, dislikedFoods })} />
      <Button
        className="w-full"
        disabled={!dirty || update.isPending}
        onClick={async () => {
          try {
            await update.mutateAsync({ ...draft, displayName: draft.displayName?.trim() || undefined })
            toast.success('Preferencias guardadas')
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'No se ha podido guardar')
          }
        }}
      >
        Guardar preferencias
      </Button>
    </Group>
  )
}

function ChipInput({ label, placeholder, values, onChange }: { label: string; placeholder: string; values: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('')
  const id = `chip-${label.replace(/\s/g, '-').toLowerCase()}`
  const add = () => {
    const v = text.trim().toLowerCase()
    if (v && !values.includes(v)) onChange([...values, v])
    setText('')
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    }
  }
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input id={id} placeholder={placeholder} value={text} enterKeyHint="done" onChange={(e) => setText(e.target.value)} onKeyDown={onKey} />
        <Button variant="soft" onClick={add} disabled={!text.trim()}>
          Añadir
        </Button>
      </div>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2 pt-1">
          {values.map((v) => (
            <li key={v} className="flex h-9 items-center gap-1 rounded-full bg-surface-2 pl-3.5 text-[13px] font-medium">
              {v}
              <button type="button" aria-label={`Quitar ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="grid size-9 place-items-center text-muted">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ThemeSection({ prefs }: { prefs: Preferences }) {
  const update = useUpdatePreferences()
  return (
    <Group title="🎨 Apariencia">
      <SegmentedControl<ThemePreference>
        label="Tema"
        value={prefs.theme}
        onChange={(theme) => update.mutate({ ...prefs, theme }, { onSuccess: () => toast.success('Tema actualizado') })}
        options={[
          { value: 'system', label: 'Sistema', icon: <Monitor className="size-4" /> },
          { value: 'light', label: 'Claro', icon: <Sun className="size-4" /> },
          { value: 'dark', label: 'Oscuro', icon: <Moon className="size-4" /> },
        ]}
      />
    </Group>
  )
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ file: unknown; v: BackupValidation } | null>(null)
  const [exporting, setExporting] = useState(false)
  const importer = useImportBackup()

  async function doExport() {
    setExporting(true)
    try {
      const { json, filename } = await api.backup.export()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('Copia de seguridad exportada')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al exportar')
    } finally {
      setExporting(false)
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const parsed = JSON.parse(await f.text())
      const v = await api.backup.validate(parsed)
      if (!v.ok) {
        toast.error(v.error ?? 'Archivo de copia de seguridad no válido')
        return
      }
      setPending({ file: parsed, v })
    } catch {
      toast.error('Ese archivo no es un JSON válido')
    }
  }

  return (
    <Group title="💾 Tus datos" description="Todo se guarda solo en este dispositivo. Exporta una copia de seguridad para no perderlo o pasarlo a otro dispositivo.">
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={doExport} disabled={exporting}>
          <Download className="size-4" /> Exportar
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" /> Importar
        </Button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="¿Reemplazar todos los datos?"
        description={
          pending?.v.summary
            ? `Esta copia del ${new Date(pending.v.summary.exportedAt).toLocaleDateString('es-ES')} tiene ${pending.v.summary.entries} registros del diario, ${pending.v.summary.foods} alimentos propios y ${pending.v.summary.recipes} recetas. Se reemplazarán los datos actuales de este dispositivo.`
            : 'Se reemplazarán los datos actuales de este dispositivo.'
        }
        confirmLabel="Importar"
        destructive
        busy={importer.isPending}
        onConfirm={async () => {
          try {
            await importer.mutateAsync(pending!.file)
            toast.success('Copia de seguridad importada')
            setPending(null)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error al importar')
          }
        }}
      />
    </Group>
  )
}

function InstallSection() {
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone)
  return (
    <Group title="📱 Instalar en el iPhone">
      {standalone ? (
        <p className="text-[15px]">Estás usando Orange Nutrition como app instalada.</p>
      ) : (
        <ol className="space-y-2.5 text-[15px]">
          {[
            'Abre esta página en Safari.',
            <>
              Toca <Share className="inline size-4 -translate-y-0.5" /> Compartir.
            </>,
            'Elige «Añadir a pantalla de inicio».',
            'Comprueba que «Abrir como app web» está activado.',
            'Toca Añadir.',
          ].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-soft text-[12px] font-semibold text-accent">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
    </Group>
  )
}

function AiSection() {
  const status = useAiStatus()
  const setKey = useSetAiKey()
  const accept = useAcceptAiNotice()
  const revoke = useRevokeAi()
  const setEnabled = useSetAssistantEnabled()
  const setPhoto = useSetPhotoEnabled()
  const test = useTestAi()
  const [key, setKeyInput] = useState('')
  const [showNotice, setShowNotice] = useState(false)

  useEffect(() => {
    if (window.location.hash === '#ai') document.getElementById('ai')?.scrollIntoView({ behavior: 'smooth' })
  }, [status.data])

  const s = status.data
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Algo ha ido mal')
    }
  }

  return (
    <Group
      id="ai"
      title="✨ IA con Gemini"
      description="Opcional. Activa el Coach con IA y el reconocimiento de fotos de comidas. Usa tu propia clave de API de Google Gemini (gratuita), guardada solo en este dispositivo."
    >
      {!s ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-soft text-accent">
              <Sparkles className="size-4" />
            </div>
            <p className="text-[14px] leading-relaxed">
              {s.assistantAvailable || s.photoAvailable
                ? [s.assistantAvailable && 'La pestaña Coach usa Gemini para chatear.', s.photoAvailable && 'Puedes registrar comidas con una foto en Añadir comida → Foto.']
                    .filter(Boolean)
                    .join(' ')
                : 'Actívalos para chatear con Gemini en la pestaña Coach y registrar comidas con una foto. Sin ellos, todo lo demás funciona igual.'}
            </p>
          </div>

          {/* 1. API key */}
          <div className="space-y-1.5">
            <Label htmlFor="ai-key">Clave de API</Label>
            {s.hasApiKey ? (
              <div className="flex items-center gap-2">
                <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-border bg-surface-2 px-4 text-sm">
                  <KeyRound className="size-4 text-muted" /> Clave guardada {s.apiKeyHint}
                </div>
                <Button variant="outline" onClick={() => run(() => setKey.mutateAsync(null), 'Clave de API eliminada')}>
                  Quitar
                </Button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <Input
                    id="ai-key"
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Pega tu clave de API de Gemini"
                    value={key}
                    onChange={(e) => setKeyInput(e.target.value)}
                  />
                  <Button
                    disabled={key.trim().length < 10 || setKey.isPending}
                    onClick={() => run(async () => (await setKey.mutateAsync(key.trim()), setKeyInput('')), 'Clave de API guardada')}
                  >
                    Guardar
                  </Button>
                </div>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-accent"
                >
                  Consigue una clave gratis en Google AI Studio <ExternalLink className="size-3.5" />
                </a>
              </>
            )}
          </div>

          {/* 2. Privacy notice */}
          {s.hasApiKey && !s.consentAccepted && (
            <div className="space-y-3 rounded-2xl bg-soft p-4">
              <p className="text-[14px] font-medium">Antes de activar la IA</p>
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground/80">
                {showNotice ? s.privacyNotice : s.privacyNotice.split('\n').slice(0, 2).join('\n')}
              </p>
              {!showNotice && (
                <button type="button" className="text-[13px] font-medium text-accent" onClick={() => setShowNotice(true)}>
                  Leer el aviso completo
                </button>
              )}
              <Button className="w-full" disabled={accept.isPending} onClick={() => run(() => accept.mutateAsync(), 'Gracias, ya puedes activar el asistente')}>
                Entendido, continuar
              </Button>
            </div>
          )}

          {/* 3. Switch + test */}
          {s.hasApiKey && s.consentAccepted && (
            <>
              <Switch
                label="Usar Gemini en el Coach"
                checked={s.assistantEnabled}
                disabled={setEnabled.isPending}
                onChange={(v) => run(() => setEnabled.mutateAsync(v))}
              />
              <Switch
                label="📸 Reconocer comidas en fotos"
                hint="Añadir comida → Foto. La foto se envía a Google; Gemini solo identifica los alimentos y estima los gramos: los valores nutricionales salen de la base de datos de alimentos."
                checked={s.photoEnabled}
                disabled={setPhoto.isPending}
                onChange={(v) => run(() => setPhoto.mutateAsync(v), v ? 'Reconocimiento de fotos activado' : undefined)}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={test.isPending}
                  onClick={async () => {
                    const r = await test.mutateAsync().catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : 'Ha fallado' }))
                    if (r.ok) toast.success(r.message)
                    else toast.error(r.message)
                  }}
                >
                  {test.isPending ? 'Probando…' : 'Probar conexión'}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => run(() => revoke.mutateAsync(false), 'IA desactivada')}>
                  Desactivar IA
                </Button>
              </div>
              <p className="text-[12.5px] leading-relaxed text-muted">
                Chat: para responder, se envían a Google tus mensajes, tu diario de hoy y las medias de nutrientes de 7 días. Fotos: solo se envía la
                imagen reducida (y tu nota opcional). En el plan gratuito, Google puede usarlos para mejorar sus productos. Los valores
                nutricionales de las propuestas de platos siempre salen de la base de datos de alimentos de la app.
              </p>
            </>
          )}
        </>
      )}
    </Group>
  )
}

function Switch({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition peer-focus-visible:ring-4 peer-focus-visible:ring-primary/20',
          checked ? 'bg-primary' : 'border border-border bg-surface-2',
        )}
      >
        <span className={cn('absolute top-0.5 size-6 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </label>
  )
}
