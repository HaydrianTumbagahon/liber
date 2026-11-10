import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  ArrowLeft,
  Check,
  RefreshCw,
  Trash2,
  Upload,
  Download,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { Dialog } from '../../components/ui/Dialog.tsx'
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx'
import { Toggle } from '../../components/ui/Toggle.tsx'
import { useSettings } from '../../lib/theme.tsx'
import { useSpeechVoices } from '../../lib/useSpeechVoices.ts'
import type { LibraryLayout, ReadingMode, ThemeMode } from '../../lib/theme.tsx'
import {
  clearCachedFiles,
  resyncLibrary,
  resetDatabase,
  seedMockLibrary,
} from '../../data/libraryRepository.ts'
import { defaultSettings } from '../../lib/theme.tsx'

const themeOptions = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
] as const

const readingOptions = [
  { label: 'Continuous vertical', value: 'continuous' },
  { label: 'Paginated LTR', value: 'paginated-ltr' },
  { label: 'Paginated RTL', value: 'paginated-rtl' },
] as const

const layoutOptions = [
  { label: 'Grid', value: 'grid' },
  { label: 'List', value: 'list' },
] as const

const appVersion = '0.0.0'

function SettingsSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="settings-section" aria-labelledby={`settings-${title}`}>
      <h2 className="settings-section__title" id={`settings-${title}`}>
        {title}
      </h2>
      <div className="settings-section__content">{children}</div>
    </section>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const { settings, updateSettings } = useSettings()
  const { voices, supported: speechSupported } = useSpeechVoices()
  const settingsRef = useRef<HTMLElement | null>(null)
  const [desktopMode, setDesktopMode] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [devBusy, setDevBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [storageInfo, setStorageInfo] = useState({
    usage: 0,
    quota: 0,
    persisted: false,
  })
  const [persisting, setPersisting] = useState(false)

  const storageWarning =
    storageInfo.quota > 0 && storageInfo.usage / storageInfo.quota > 0.85
      ? 'Storage is nearly full. Clear cache or delete unused books to free space.'
      : null
  const voiceNotice =
    speechSupported && voices.length === 0
      ? 'No speech voices are available in this browser yet.'
      : null

  useEffect(() => {
    if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
      return
    }

    const refreshStorageEstimate = async () => {
      const estimate = await navigator.storage.estimate()
      const persisted =
        'persisted' in navigator.storage
          ? await navigator.storage.persisted()
          : false
      setStorageInfo({
        usage: estimate.usage ?? 0,
        quota: estimate.quota ?? 0,
        persisted,
      })
    }

    void refreshStorageEstimate()
  }, [])

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 MB'
    const megabytes = bytes / (1024 * 1024)
    if (megabytes < 1) return `${Math.max(1, Math.round(megabytes * 10) / 10)} KB`
    return `${Math.round(megabytes * 10) / 10} MB`
  }

  const requestPersistentStorage = async () => {
    if (!('storage' in navigator) || !('persist' in navigator.storage)) {
      return
    }

    setPersisting(true)
    try {
      const persisted = await navigator.storage.persist()
      const estimate = await navigator.storage.estimate()
      setStorageInfo({
        usage: estimate.usage ?? 0,
        quota: estimate.quota ?? 0,
        persisted,
      })
    } finally {
      setPersisting(false)
    }
  }

  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 48rem)')
    const updateDesktopMode = () => setDesktopMode(desktopQuery.matches)
    updateDesktopMode()
    desktopQuery.addEventListener('change', updateDesktopMode)
    return () => desktopQuery.removeEventListener('change', updateDesktopMode)
  }, [])

  useEffect(() => {
    if (!desktopMode) return
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    settingsRef.current
      ?.querySelector<HTMLButtonElement>('.settings-page__back')
      ?.focus()

    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [desktopMode])

  const resync = async () => {
    setResyncing(true)
    setStatusMessage('')
    try {
      const result = await resyncLibrary()
      setStatusMessage(
        result.permissionDenied > 0
          ? 'Folder access was denied. Stored EPUB copies were checked.'
          : `Synced: ${result.added} added, ${result.relinked} relinked, ${result.missing} missing.`,
      )
    } catch (error) {
      setStatusMessage(
        error instanceof Error
          ? error.message
          : 'Could not resync the library.',
      )
    } finally {
      setResyncing(false)
    }
  }

  const clearCache = async () => {
    await clearCachedFiles()
    setClearDialogOpen(false)
    setStatusMessage(
      'Cached EPUB files cleared. Reading progress was preserved.',
    )
  }

  const seedLibrary = async () => {
    setDevBusy(true)
    try {
      await seedMockLibrary()
      setStatusMessage('Mock library seeded.')
    } finally {
      setDevBusy(false)
    }
  }

  const resetLocalDatabase = async () => {
    setDevBusy(true)
    try {
      await resetDatabase(defaultSettings)
      setResetDialogOpen(false)
      setStatusMessage('Local database reset.')
    } finally {
      setDevBusy(false)
    }
  }

  const containDesktopFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (!desktopMode || clearDialogOpen) return

    if (event.key === 'Escape') {
      event.preventDefault()
      navigate('/')
      return
    }

    if (event.key !== 'Tab') return

    const focusable = Array.from(
      settingsRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter(
      (element) =>
        element.getClientRects().length > 0 &&
        !element.closest('dialog:not([open])'),
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (!first || !last) {
      event.preventDefault()
      settingsRef.current?.focus()
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <>
      <button
        type="button"
        className="settings-backdrop"
        aria-label="Close settings"
        onClick={() => navigate('/')}
      />
      <motion.aside
        ref={settingsRef}
        className="settings-page"
        role={desktopMode ? 'dialog' : 'main'}
        aria-modal={desktopMode ? true : undefined}
        aria-labelledby="settings-page-title"
        tabIndex={desktopMode ? -1 : undefined}
        onKeyDown={containDesktopFocus}
        initial={reduceMotion ? false : { x: '100%' }}
        animate={{ x: 0 }}
        exit={reduceMotion ? undefined : { x: '100%' }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: 'easeOut' }}
      >
        <header className="settings-page__header">
          <Button
            type="button"
            variant="ghost"
            className="settings-page__back"
            onClick={() => navigate('/')}
            aria-label="Back to Library"
            title="Back to Library"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </Button>
          <h1 id="settings-page-title">Settings</h1>
          <span className="settings-page__header-spacer" />
        </header>

        <SettingsSection title="Appearance">
          <div className="settings-row">
            <h3>Theme</h3>
            <SegmentedControl<ThemeMode>
              label="Theme"
              value={settings.theme}
              options={themeOptions}
              onChange={(theme) => updateSettings({ theme })}
            />
          </div>
        </SettingsSection>

        <SettingsSection title="Reading">
          <div className="settings-row">
            <h3>Mode</h3>
            <SegmentedControl<ReadingMode>
              label="Reading mode"
              value={settings.readingMode}
              options={readingOptions}
              onChange={(readingMode) => updateSettings({ readingMode })}
            />
          </div>
          <div className="settings-row">
            <h3>Reader chrome</h3>
            <Toggle
              label="Auto-hide top bar"
              checked={settings.autoHideTopBar}
              onChange={(autoHideTopBar) => updateSettings({ autoHideTopBar })}
            />
          </div>
        </SettingsSection>

        <SettingsSection title="Text-to-speech">
          <label className="settings-slider" htmlFor="default-speed">
            <span className="settings-slider__label">Default speed</span>
            <output className="settings-slider__value" htmlFor="default-speed">
              {settings.defaultSpeed.toFixed(1)}x
            </output>
            <input
              id="default-speed"
              type="range"
              min="0.7"
              max="2"
              step="0.1"
              value={settings.defaultSpeed}
              onChange={(event) =>
                updateSettings({ defaultSpeed: Number(event.target.value) })
              }
            />
            <span className="settings-slider__range" aria-hidden="true">
              <span>0.7x</span>
              <span>2.0x</span>
            </span>
          </label>
          <label className="settings-row settings-row--voice">
            <span className="settings-row__label">Preferred voice</span>
            <select
              value={
                voices.some(
                  (voice) => voice.voiceURI === settings.preferredVoice,
                )
                  ? settings.preferredVoice
                  : ''
              }
              disabled={!speechSupported}
              onChange={(event) =>
                updateSettings({
                  preferredVoice: event.target.value,
                })
              }
            >
              <option value="">System default</option>
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </label>
          {!speechSupported && (
            <p className="settings-status" role="status">
              Speech synthesis is not available in this browser.
            </p>
          )}
          {voiceNotice && (
            <p className="settings-status" role="status">
              {voiceNotice}
            </p>
          )}
        </SettingsSection>

        <SettingsSection title="Library">
          <div className="settings-row">
            <h3>Default layout</h3>
            <SegmentedControl<LibraryLayout>
              label="Default library layout"
              value={settings.libraryLayout}
              options={layoutOptions}
              onChange={(libraryLayout) => updateSettings({ libraryLayout })}
            />
          </div>
        </SettingsSection>

        <SettingsSection title="Data">
          <div className="settings-storage-row">
            <div>
              <span className="settings-storage-row__label">Storage used</span>
              <strong>
                {formatBytes(storageInfo.usage)} / {formatBytes(storageInfo.quota)}
              </strong>
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={persisting || !('storage' in navigator)}
              onClick={() => void requestPersistentStorage()}
            >
              {storageInfo.persisted ? 'Storage enabled' : 'Enable storage'}
            </Button>
          </div>
          {storageWarning && (
            <p className="settings-status" role="status">
              {storageWarning}
            </p>
          )}
          <div className="settings-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setClearDialogOpen(true)}
            >
              <Trash2 size={16} aria-hidden="true" />
              Clear cache
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={resyncing}
              onClick={() => void resync()}
            >
              <RefreshCw
                size={16}
                aria-hidden="true"
                className={resyncing ? 'settings-resync__icon is-spinning' : ''}
              />
              {resyncing ? 'Resyncing' : 'Resync library'}
            </Button>
          </div>
          <div className="settings-actions settings-actions--later">
            <div className="settings-later-item">
              <Button type="button" variant="secondary" disabled>
                <Download size={16} aria-hidden="true" />
                Export progress
              </Button>
              <Badge>Coming later</Badge>
            </div>
            <div className="settings-later-item">
              <Button type="button" variant="secondary" disabled>
                <Upload size={16} aria-hidden="true" />
                Import progress
              </Button>
              <Badge>Coming later</Badge>
            </div>
          </div>
          {statusMessage && (
            <p className="settings-status" role="status">
              <Check size={16} aria-hidden="true" />
              {statusMessage}
            </p>
          )}
        </SettingsSection>

        <SettingsSection title="About">
          <dl className="settings-about">
            <div>
              <dt>Version</dt>
              <dd>{appVersion}</dd>
            </div>
            <div>
              <dt>Credits</dt>
              <dd>Built with React, Vite, Tailwind CSS, Dexie, and Lucide.</dd>
            </div>
          </dl>
        </SettingsSection>

        {import.meta.env.DEV && (
          <SettingsSection title="Developer tools">
            <div className="settings-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={devBusy}
                onClick={seedLibrary}
              >
                Seed mock library
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={devBusy}
                onClick={() => setResetDialogOpen(true)}
              >
                Reset local database
              </Button>
            </div>
          </SettingsSection>
        )}

        <Dialog
          open={clearDialogOpen}
          title="Clear cached data?"
          onOpenChange={setClearDialogOpen}
        >
          <p className="reading-text">
            This will remove cached book files from this device. This action
            cannot be undone.
          </p>
          <Button
            type="button"
            variant="primary"
            className="settings-clear-confirm"
            onClick={clearCache}
          >
            Clear cache
          </Button>
        </Dialog>
        <Dialog
          open={resetDialogOpen}
          title="Reset local database?"
          onOpenChange={setResetDialogOpen}
        >
          <p className="reading-text">
            This removes all stored books and reading progress on this device.
          </p>
          <Button
            type="button"
            variant="primary"
            className="settings-clear-confirm"
            disabled={devBusy}
            onClick={resetLocalDatabase}
          >
            Reset local database
          </Button>
        </Dialog>
      </motion.aside>
    </>
  )
}
