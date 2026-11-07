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
      <PageHeader title="Settings" emoji="⚙️" back />
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

const DIETS = ['Vegetarian', 'Vegan', 'Pescatarian', 'Gluten-free', 'Dairy-free']

function PreferencesSection({ prefs }: { prefs: Preferences }) {
  const update = useUpdatePreferences()
  const [draft, setDraft] = useState(prefs)
  useEffect(() => {
    setDraft((d) => ({ ...d, theme: prefs.theme }))
  }, [prefs.theme])
  const dirty = JSON.stringify({ ...draft, theme: null }) !== JSON.stringify({ ...prefs, theme: null })

  const toggleDiet = (d: string) => {
    const k = d.toLowerCase()
    setDraft({ ...draft, dietary: draft.dietary.includes(k) ? draft.dietary.filter((x) => x !== k) : [...draft.dietary, k] })
  }

  return (
    <Group title="🥗 Food preferences" description="Used to filter recommendations.">
      <div className="space-y-1.5">
        <Label htmlFor="pref-name">Your name (for the greeting)</Label>
        <Input id="pref-name" value={draft.displayName ?? ''} maxLength={30} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
      </div>
      <div>
        <p className="mb-2 text-[13px] font-medium text-muted">Dietary preferences</p>
        <div className="flex flex-wrap gap-2">
          {DIETS.map((d) => {
            const on = draft.dietary.includes(d.toLowerCase())
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => toggleDiet(d)}
                className={cn(
                  'h-10 rounded-full border px-4 text-[13px] font-medium transition',
                  on ? 'border-accent bg-accent text-white dark:text-background' : 'border-border bg-surface',
                )}
              >
                {d}
              </button>
            )
          })}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[13px] font-medium text-muted">Allergies</p>
        <p className="mb-2 text-[12px] text-muted">The 14 EU allergens. Foods without confirmed allergen info are excluded while any is selected.</p>
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
      <ChipInput label="Disliked foods" placeholder="e.g. olives" values={draft.dislikedFoods} onChange={(dislikedFoods) => setDraft({ ...draft, dislikedFoods })} />
      <Button
        className="w-full"
        disabled={!dirty || update.isPending}
        onClick={async () => {
          try {
            await update.mutateAsync({ ...draft, displayName: draft.displayName?.trim() || undefined })
            toast.success('Preferences saved')
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not save')
          }
        }}
      >
        Save preferences
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
          Add
        </Button>
      </div>
      {values.length > 0 && (
        <ul className="flex flex-wrap gap-2 pt-1">
          {values.map((v) => (
            <li key={v} className="flex h-9 items-center gap-1 rounded-full bg-surface-2 pl-3.5 text-[13px] font-medium">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="grid size-9 place-items-center text-muted">
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
    <Group title="🎨 Appearance">
      <SegmentedControl<ThemePreference>
        label="Theme"
        value={prefs.theme}
        onChange={(theme) => update.mutate({ ...prefs, theme }, { onSuccess: () => toast.success('Theme updated') })}
        options={[
          { value: 'system', label: 'System', icon: <Monitor className="size-4" /> },
          { value: 'light', label: 'Light', icon: <Sun className="size-4" /> },
          { value: 'dark', label: 'Dark', icon: <Moon className="size-4" /> },
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
      toast.success('Backup exported')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
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
        toast.error(v.error ?? 'Invalid backup file')
        return
      }
      setPending({ file: parsed, v })
    } catch {
      toast.error("That file isn't valid JSON")
    }
  }

  return (
    <Group title="💾 Your data" description="Everything is stored only on this device. Export a backup to keep it safe or move it to another device.">
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={doExport} disabled={exporting}>
          <Download className="size-4" /> Export
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" /> Import
        </Button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title="Replace all data?"
        description={
          pending?.v.summary
            ? `This backup from ${new Date(pending.v.summary.exportedAt).toLocaleDateString()} has ${pending.v.summary.entries} diary entries, ${pending.v.summary.foods} custom foods and ${pending.v.summary.recipes} recipes. Your current data on this device will be replaced.`
            : 'Your current data on this device will be replaced.'
        }
        confirmLabel="Import"
        destructive
        busy={importer.isPending}
        onConfirm={async () => {
          try {
            await importer.mutateAsync(pending!.file)
            toast.success('Backup imported')
            setPending(null)
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Import failed')
          }
        }}
      />
    </Group>
  )
}

function InstallSection() {
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone)
  return (
    <Group title="📱 Install on iPhone">
      {standalone ? (
        <p className="text-[15px]">You're using Nourish as an installed app.</p>
      ) : (
        <ol className="space-y-2.5 text-[15px]">
          {[
            'Open this page in Safari.',
            <>
              Tap <Share className="inline size-4 -translate-y-0.5" /> Share.
            </>,
            'Choose “Add to Home Screen”.',
            'Make sure “Open as Web App” is on.',
            'Tap Add.',
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
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <Group
      id="ai"
      title="✨ AI with Gemini"
      description="Optional. Powers the chat assistant and meal-photo recognition. Uses your own free Google Gemini API key, stored only on this device."
    >
      {!s ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-soft text-accent">
              <Sparkles className="size-4" />
            </div>
            <p className="text-[14px] leading-relaxed">
              {s.assistantAvailable || s.photoAvailable
                ? [s.assistantAvailable && 'The Assistant tab is chatting with Gemini.', s.photoAvailable && 'You can log meals from a photo in Add Food → Photo.']
                    .filter(Boolean)
                    .join(' ')
                : 'Turn these on to chat with Gemini in the Assistant tab and to log meals from a photo. Without them, everything else works as usual.'}
            </p>
          </div>

          {/* 1. API key */}
          <div className="space-y-1.5">
            <Label htmlFor="ai-key">API key</Label>
            {s.hasApiKey ? (
              <div className="flex items-center gap-2">
                <div className="flex h-12 flex-1 items-center gap-2 rounded-2xl border border-border bg-surface-2 px-4 text-sm">
                  <KeyRound className="size-4 text-muted" /> Saved key {s.apiKeyHint}
                </div>
                <Button variant="outline" onClick={() => run(() => setKey.mutateAsync(null), 'API key removed')}>
                  Remove
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
                    placeholder="Paste your Gemini API key"
                    value={key}
                    onChange={(e) => setKeyInput(e.target.value)}
                  />
                  <Button
                    disabled={key.trim().length < 10 || setKey.isPending}
                    onClick={() => run(async () => (await setKey.mutateAsync(key.trim()), setKeyInput('')), 'API key saved')}
                  >
                    Save
                  </Button>
                </div>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-accent"
                >
                  Get a free key at Google AI Studio <ExternalLink className="size-3.5" />
                </a>
              </>
            )}
          </div>

          {/* 2. Privacy notice */}
          {s.hasApiKey && !s.consentAccepted && (
            <div className="space-y-3 rounded-2xl bg-soft p-4">
              <p className="text-[14px] font-medium">Before turning AI on</p>
              <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground/80">
                {showNotice ? s.privacyNotice : s.privacyNotice.split('\n').slice(0, 2).join('\n')}
              </p>
              {!showNotice && (
                <button type="button" className="text-[13px] font-medium text-accent" onClick={() => setShowNotice(true)}>
                  Read the full notice
                </button>
              )}
              <Button className="w-full" disabled={accept.isPending} onClick={() => run(() => accept.mutateAsync(), 'Thanks — you can now turn the assistant on')}>
                I understand, continue
              </Button>
            </div>
          )}

          {/* 3. Switch + test */}
          {s.hasApiKey && s.consentAccepted && (
            <>
              <Switch
                label="Use Gemini in the Assistant"
                checked={s.assistantEnabled}
                disabled={setEnabled.isPending}
                onChange={(v) => run(() => setEnabled.mutateAsync(v))}
              />
              <Switch
                label="📸 Recognise meals from photos"
                hint="Add Food → Photo. The photo is sent to Google; Gemini only names foods and estimates grams — nutrition comes from the food database."
                checked={s.photoEnabled}
                disabled={setPhoto.isPending}
                onChange={(v) => run(() => setPhoto.mutateAsync(v), v ? 'Photo recognition on' : undefined)}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={test.isPending}
                  onClick={async () => {
                    const r = await test.mutateAsync().catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : 'Failed' }))
                    if (r.ok) toast.success(r.message)
                    else toast.error(r.message)
                  }}
                >
                  {test.isPending ? 'Testing…' : 'Test connection'}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => run(() => revoke.mutateAsync(false), 'AI turned off')}>
                  Turn AI off
                </Button>
              </div>
              <p className="text-[12.5px] leading-relaxed text-muted">
                Chat: your messages, today's diary and 7-day nutrient averages are sent to Google to answer. Photos: only the downscaled image (and
                your optional note) is sent. Google's free tier may use them to improve
                its products. Nutrition numbers on meal cards always come from the app's food database.
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
