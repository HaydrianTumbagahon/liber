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
  FolderOpen,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/ui/Button.tsx'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.tsx'
import { Select } from '../../components/ui/Select.tsx'
import { Slider } from '../../components/ui/Slider.tsx'
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx'
import { Toggle } from '../../components/ui/Toggle.tsx'
import { useStatusBanner } from '../../components/ui/StatusBanner.tsx'
import { useToast } from '../../components/ui/Toast.tsx'
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
import { useLenisLock } from '../../lib/LenisProvider.tsx'
import {
  showLibraryDirectoryPicker,
  storageProvider,
} from '../../lib/storage/index.ts'
import type { StorageStatus } from '../../lib/storage/index.ts'

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
  const acquireLenisLock = useLenisLock()
  const statusBanner = useStatusBanner()
  const showToast = useToast()
  const { settings, updateSettings } = useSettings()
  const { voices, supported: speechSupported } = useSpeechVoices()
  const settingsRef = useRef<HTMLElement | null>(null)
  const [desktopMode, setDesktopMode] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [devBusy, setDevBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [folderStatus, setFolderStatus] = useState<StorageStatus>('not-configured')
  const [folderName, setFolderName] = useState<string | null>(null)
  const [fallbackMode, setFallbackMode] = useState(false)
  const [folderBusy, setFolderBusy] = useState(false)
  const [pendingBackup, setPendingBackup] = useState<File | null>(null)
  const [backupImportOpen, setBackupImportOpen] = useState(false)
  const backupInputRef = useRef<HTMLInputElement>(null)
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

  const refreshFolderStatus = () => {
    setFolderStatus(storageProvider.getStatus())
    setFolderName(storageProvider.getFolderName())
    setFallbackMode(storageProvider.isUsingFallback())
  }

  useEffect(() => {
    let active = true
    void storageProvider.init().then(() => {
      if (active) refreshFolderStatus()
    })
    return () => {
      active = false
    }
  }, [])

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
    if (megabytes < 1)
      return `${Math.max(1, Math.round(megabytes * 10) / 10)} KB`
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
    return acquireLenisLock()
  }, [acquireLenisLock, desktopMode])

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
    statusBanner.working('Resyncing library…')
    try {
      const result = await resyncLibrary()
      if (
        result.added === 0 &&
        result.relinked === 0 &&
        result.missing === 0 &&
        (result.removed ?? 0) === 0 &&
        result.errors === 0 &&
        result.permissionDenied === 0
      ) {
        statusBanner.hide()
        showToast({
          message: 'Library is up to date. No new updates found.',
          variant: 'info',
        })
        return
      }
      statusBanner.done(
        result.permissionDenied > 0
          ? 'Folder access was denied. Stored EPUB copies were checked.'
          : `Synced: ${result.added} books added, ${result.relinked} files changed, ${(result.removed ?? 0) + result.missing} files missing.`,
      )
    } catch (error) {
      statusBanner.hide()
      showToast({
        variant: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not resync the library.',
      })
    } finally {
      setResyncing(false)
    }
  }

  const changeLibraryFolder = async () => {
    setFolderBusy(true)
    try {
      const directory = await showLibraryDirectoryPicker()
      const status = await storageProvider.connect(directory)
      refreshFolderStatus()
      if (status !== 'connected') {
        showToast({
          message: 'Folder access was not granted. Choose a regular folder and allow read/write access.',
          variant: 'warning',
        })
        return
      }
      const result = await storageProvider.listLibrary()
      showToast({
        message:
          result.books.length > 0
            ? `Library restored: ${result.books.length} ${result.books.length === 1 ? 'book' : 'books'}.`
            : 'Library folder changed.',
        variant: 'success',
      })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        showToast({
          message:
            error instanceof Error
              ? error.message
              : 'This folder could not be used. Choose a regular folder.',
          variant: 'error',
        })
      }
    } finally {
      setFolderBusy(false)
      refreshFolderStatus()
    }
  }

  const reconnectLibraryFolder = async () => {
    setFolderBusy(true)
    try {
      const status = await storageProvider.reconnect()
      refreshFolderStatus()
      if (status === 'connected') {
        await storageProvider.listLibrary()
        showToast({ message: 'Library folder reconnected.', variant: 'success' })
      } else {
        showToast({
          message:
            status === 'folder-missing'
              ? 'The folder is missing. Choose it again to restore the library.'
              : 'Folder access was not granted. Try reconnecting again.',
          variant: 'warning',
        })
      }
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : 'Could not reconnect the folder.',
        variant: 'error',
      })
    } finally {
      setFolderBusy(false)
      refreshFolderStatus()
    }
  }

  const exportBackup = async () => {
    try {
      const backup = await storageProvider.exportData()
      const url = URL.createObjectURL(backup)
      const link = document.createElement('a')
      link.href = url
      link.download = 'liber-backup.json'
      link.click()
      URL.revokeObjectURL(url)
      showToast({ message: 'Data backup exported.', variant: 'success' })
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : 'Could not export the data backup.',
        variant: 'error',
      })
    }
  }

  const selectBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setPendingBackup(file)
    setBackupImportOpen(true)
  }

  const importBackup = async () => {
    if (!pendingBackup) return
    await storageProvider.importData(pendingBackup, { replaceExisting: true })
    setPendingBackup(null)
    setBackupImportOpen(false)
    showToast({ message: 'Data backup imported.', variant: 'success' })
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
      <Button
        type="button"
        variant="ghost"
        className="settings-backdrop"
        aria-label="Close settings"
        whileTap={undefined}
        onClick={() => navigate('/')}
      />
      <motion.aside
        ref={settingsRef}
        className="settings-page"
        role={desktopMode ? 'dialog' : 'main'}
        aria-modal={desktopMode ? true : undefined}
        aria-labelledby="settings-page-title"
        data-lenis-prevent={desktopMode ? '' : undefined}
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
          <div className="settings-slider">
            <span className="settings-slider__label">Default speed</span>
            <output className="settings-slider__value">
              {settings.defaultSpeed.toFixed(1)}x
            </output>
            <Slider
              label="Default speech speed"
              value={settings.defaultSpeed}
              min={0.7}
              max={2}
              step={0.1}
              valueText={`${settings.defaultSpeed.toFixed(1)}x`}
              onChange={(defaultSpeed) => updateSettings({ defaultSpeed })}
            />
            <span className="settings-slider__range" aria-hidden="true">
              <span>0.7x</span>
              <span>2.0x</span>
            </span>
          </div>
          <div className="settings-row settings-row--voice">
            <span className="settings-row__label">Preferred voice</span>
            <Select
              label="Preferred voice"
              value={
                voices.some(
                  (voice) => voice.voiceURI === settings.preferredVoice,
                )
                  ? settings.preferredVoice
                  : ''
              }
              options={[
                { value: '', label: 'System default' },
                ...voices.map((voice) => ({
                  value: voice.voiceURI,
                  label: `${voice.name} (${voice.lang})`,
                })),
              ]}
              disabled={!speechSupported}
              onChange={(preferredVoice) =>
                updateSettings({
                  preferredVoice,
                })
              }
            />
          </div>
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

        <SettingsSection title="Library folder">
          <div className="settings-storage-row">
            <div>
              <span className="settings-storage-row__label">
                {fallbackMode ? 'Storage mode' : 'Connected folder'}
              </span>
              <strong>
                {fallbackMode
                  ? 'In-app storage'
                  : folderName ??
                    (folderStatus === 'needs-permission'
                      ? 'Permission needed'
                      : folderStatus === 'folder-missing'
                        ? 'Folder missing'
                        : folderStatus === 'unsupported'
                          ? 'Not supported'
                          : 'Not connected')}
              </strong>
            </div>
            <span className="settings-storage-row__label">
              {fallbackMode ? 'Ready' : folderStatus}
            </span>
          </div>
          <div className="settings-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={folderBusy || folderStatus === 'unsupported'}
              onClick={() => void changeLibraryFolder()}
            >
              <FolderOpen size={16} aria-hidden="true" />
              {folderBusy ? 'Connecting' : 'Change folder'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={folderBusy || folderStatus === 'unsupported' || fallbackMode}
              onClick={() => void reconnectLibraryFolder()}
            >
              {folderBusy ? 'Reconnecting' : 'Reconnect'}
            </Button>
          </div>
        </SettingsSection>

        <SettingsSection title="Data">
          <div className="settings-storage-row">
            <div>
              <span className="settings-storage-row__label">Storage used</span>
              <strong>
                {formatBytes(storageInfo.usage)} /{' '}
                {formatBytes(storageInfo.quota)}
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
          {fallbackMode && (
            <>
              <input
                ref={backupInputRef}
                className="settings-import-input"
                type="file"
                accept=".json,application/json"
                tabIndex={-1}
                aria-hidden="true"
                onChange={selectBackup}
              />
              <div className="settings-actions">
                <Button type="button" variant="secondary" onClick={() => void exportBackup()}>
                  <Download size={16} aria-hidden="true" />
                  Export data
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => backupInputRef.current?.click()}
                >
                  <Upload size={16} aria-hidden="true" />
                  Import data
                </Button>
              </div>
            </>
          )}
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

        <ConfirmDialog
          open={clearDialogOpen}
          title="Clear cached data?"
          description="This will remove cached book files from this device. This action cannot be undone."
          confirmLabel="Clear cache"
          destructive
          onOpenChange={setClearDialogOpen}
          onConfirm={clearCache}
        />
        <ConfirmDialog
          open={backupImportOpen}
          title="Import data backup?"
          description="This replaces the settings and reading progress currently stored in this browser."
          confirmLabel="Import backup"
          onOpenChange={(open) => {
            setBackupImportOpen(open)
            if (!open) setPendingBackup(null)
          }}
          onConfirm={importBackup}
        />
        <ConfirmDialog
          open={resetDialogOpen}
          title="Reset local database?"
          description="This removes all stored books and reading progress on this device."
          confirmLabel="Reset local database"
          destructive
          onOpenChange={setResetDialogOpen}
          onConfirm={resetLocalDatabase}
        />
      </motion.aside>
    </>
  )
}
