import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { AppNavigation } from './components/AppNavigation.tsx'
import { Button } from './components/ui/Button.tsx'
import { Modal } from './components/ui/Modal.tsx'
import { useToast } from './components/ui/Toast.tsx'
import { BookDetailPage } from './features/book/BookDetailPage.tsx'
import { LibraryPage } from './features/library/LibraryPage.tsx'
import {
  OnboardingPage,
  StorageSplash,
} from './features/onboarding/OnboardingPage.tsx'
import type { OnboardingMode } from './features/onboarding/OnboardingPage.tsx'
import { ReaderPage } from './features/reader/ReaderPage.tsx'
import { SettingsPage } from './features/settings/SettingsPage.tsx'
import { Styleguide } from './features/settings/Styleguide.tsx'
import { resolveMotionPreset } from './lib/motion.ts'
import {
  APP_DIRECTORY_NAME,
  describeFolderPickerError,
  installStorageDiagnostics,
  logFolderAccessSupport,
  showLibraryDirectoryPicker,
  storageProvider,
} from './lib/storage/index.ts'

type StorageGateState =
  | 'loading'
  | 'splash'
  | 'onboarding'
  | 'reconnect'
  | 'reconnect-dismissed'
  | 'app'

function AppRoutes() {
  const location = useLocation()
  const showToast = useToast()
  const reduceMotion = useReducedMotion()
  const routeMotion = resolveMotionPreset(
    'pageTransition',
    Boolean(reduceMotion),
  )
  const isReaderRoute = location.pathname.startsWith('/read/')
  const isSettingsRoute = location.pathname === '/settings'
  const [storageGate, setStorageGate] = useState<StorageGateState>('loading')
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>('new')
  const [folderAccessReason, setFolderAccessReason] = useState('')
  const [storageBusy, setStorageBusy] = useState(false)
  const [storageError, setStorageError] = useState('')
  const updateServiceWorkerRef = useRef<
    ((reloadPage?: boolean) => Promise<void>) | null
  >(null)
  const updateNoticeShown = useRef(false)

  useEffect(() => {
    const support = logFolderAccessSupport()
    setFolderAccessReason(support.reason)
    return installStorageDiagnostics()
  }, [])

  useEffect(() => {
    let active = true
    let splashTimer: number | null = null

    void storageProvider
      .init()
      .then(() => {
        if (!active) return
        const status = storageProvider.getStatus()
        if (status === 'connected') {
          setStorageGate('app')
        } else if (status === 'unsupported') {
          setOnboardingMode('unsupported')
          setStorageGate('onboarding')
        } else if (status === 'needs-permission') {
          setStorageGate('reconnect')
        } else if (status === 'folder-missing') {
          setOnboardingMode('missing')
          setStorageGate('onboarding')
        } else {
          setOnboardingMode('new')
          setStorageGate('splash')
          splashTimer = window.setTimeout(() => {
            if (active) setStorageGate('onboarding')
          }, 850)
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        setStorageError(
          error instanceof Error ? error.message : 'Storage could not be opened.',
        )
        setOnboardingMode('new')
        setStorageGate('onboarding')
      })

    return () => {
      active = false
      if (splashTimer !== null) window.clearTimeout(splashTimer)
    }
  }, [])

  useEffect(() => {
    const handleStorageChange = () => {
      const status = storageProvider.getStatus()
      if (storageProvider.isUsingFallback() || status === 'connected') {
        setStorageGate('app')
      } else if (status === 'needs-permission') {
        setStorageGate('reconnect')
      } else if (status === 'folder-missing') {
        setOnboardingMode('missing')
        setStorageGate('onboarding')
      }
    }
    window.addEventListener('liber-storage-change', handleStorageChange)
    return () =>
      window.removeEventListener('liber-storage-change', handleStorageChange)
  }, [])

  useEffect(() => {
    const showUpdateNotice = () => {
      if (updateNoticeShown.current) return
      updateNoticeShown.current = true
      showToast({
        message: 'App update ready. Refresh to install.',
        variant: 'info',
        action: {
          label: 'Refresh',
          onClick: () => {
            if (updateServiceWorkerRef.current) {
              void updateServiceWorkerRef.current(true)
            }
          },
        },
      })
    }

    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh: showUpdateNotice,
      onRegisteredSW(_serviceWorkerUrl, registration) {
        if (registration?.waiting) showUpdateNotice()
      },
    })
    updateServiceWorkerRef.current = updateSW
  }, [showToast])

  useEffect(() => {
    if (storageGate !== 'app' || !storageProvider.isConnected()) return
    let timer: number | null = null
    let active = true

    const scan = async (notify: boolean) => {
      try {
        const result = await storageProvider.listLibrary()
        if (!active || !notify) return
        const added = result.diff.added.length
        const removed = result.diff.removed.length
        const changed = result.diff.changed.length
        if (added + removed + changed === 0) return
        showToast({
          message: `Library updated: ${added} added, ${removed} removed, ${changed} changed.`,
          variant: 'info',
        })
      } catch (error) {
        if (storageProvider.getStatus() !== 'connected') {
          window.dispatchEvent(new Event('liber-storage-change'))
        } else if (error instanceof Error && error.name === 'AbortError') {
          return
        }
      }
    }

    const scheduleScan = () => {
      if (document.visibilityState !== 'visible') return
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(() => void scan(true), 500)
    }
    void scan(false)
    window.addEventListener('focus', scheduleScan)
    document.addEventListener('visibilitychange', scheduleScan)
    return () => {
      active = false
      if (timer !== null) window.clearTimeout(timer)
      window.removeEventListener('focus', scheduleScan)
      document.removeEventListener('visibilitychange', scheduleScan)
    }
  }, [showToast, storageGate])

  const connectFolder = async () => {
    setStorageBusy(true)
    setStorageError('')
    try {
      const directory = await showLibraryDirectoryPicker()
      const status = await storageProvider.connect(directory)
      if (status !== 'connected') {
        const message =
          'Folder access was not granted. Choose or create a regular folder and allow read/write access.'
        setStorageError(message)
        showToast({ message, variant: 'warning' })
        return
      }

      setStorageGate('app')

      try {
        const result = await storageProvider.listLibrary()
        if (result.books.length > 0) {
          showToast({
            message: `Library restored: ${result.books.length} ${result.books.length === 1 ? 'book' : 'books'}.`,
            variant: 'success',
          })
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'The library could not be scanned yet, but the folder is connected.'
        showToast({ message, variant: 'warning' })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      const pickerError = describeFolderPickerError(error)
      setStorageError(pickerError.message)
      showToast({
        message: pickerError.message,
        detail: pickerError.name,
        variant: 'error',
      })
    } finally {
      setStorageBusy(false)
    }
  }

  const reconnectFolder = async () => {
    setStorageBusy(true)
    setStorageError('')
    try {
      const status = await storageProvider.reconnect()
      if (status === 'connected') {
        setStorageGate('app')
        try {
          await storageProvider.listLibrary()
        } catch (error) {
          showToast({
            message:
              error instanceof Error
                ? error.message
                : 'The library could not be scanned yet, but the folder is connected.',
            variant: 'warning',
          })
        }
        showToast({ message: 'Library reconnected.', variant: 'success' })
      } else if (status === 'folder-missing') {
        setOnboardingMode('missing')
        setStorageGate('onboarding')
      } else {
        setStorageError('Folder permission was not granted. Try again to reconnect.')
      }
    } catch (error) {
      setStorageError(
        error instanceof Error ? error.message : 'The folder could not be reconnected.',
      )
    } finally {
      setStorageBusy(false)
    }
  }

  const chooseInAppStorage = () => {
    storageProvider.useInAppStorage()
    setStorageGate('app')
    showToast({ message: 'In-app storage is ready.', variant: 'success' })
  }

  if (storageGate !== 'app' && storageGate !== 'reconnect-dismissed') {
    return (
      <>
        <AnimatePresence mode="wait" initial={false}>
          {storageGate === 'splash' && (
            <StorageSplash key="storage-splash" appName={APP_DIRECTORY_NAME} />
          )}
          {storageGate === 'onboarding' && (
            <OnboardingPage
              key="storage-onboarding"
              appName={APP_DIRECTORY_NAME}
              mode={onboardingMode}
              busy={storageBusy}
              error={storageError}
              folderAccessReason={folderAccessReason}
              onChooseFolder={() => void connectFolder()}
              onUseInAppStorage={chooseInAppStorage}
            />
          )}
        </AnimatePresence>
        {storageGate === 'reconnect' && (
          <Modal
            open
            title="Reconnect your library folder"
            onOpenChange={(open) => {
              if (!open) setStorageGate('reconnect-dismissed')
            }}
          >
            <div className="storage-reconnect">
              <p>Allow access to the folder you previously selected to restore your books and reading progress.</p>
              {storageError && (
                <p className="storage-onboarding__error" role="alert">
                  {storageError}
                </p>
              )}
              <Button
                type="button"
                variant="primary"
                size="large"
                disabled={storageBusy}
                onClick={() => void reconnectFolder()}
              >
                {storageBusy ? 'Reconnecting' : 'Reconnect folder'}
              </Button>
            </div>
          </Modal>
        )}
        {storageGate === 'loading' && (
          <main className="storage-splash" aria-busy="true" />
        )}
      </>
    )
  }

  if (storageGate === 'reconnect-dismissed') {
    return (
      <OnboardingPage
        appName={APP_DIRECTORY_NAME}
        mode="missing"
        busy={storageBusy}
        error={storageError}
        folderAccessReason={folderAccessReason}
        onChooseFolder={() => void connectFolder()}
        onUseInAppStorage={chooseInAppStorage}
      />
    )
  }

  return (
    <>
      <div className={`app-shell${isReaderRoute ? ' app-shell--reader' : ''}`}>
        {!isReaderRoute && <AppNavigation />}
        <div className="app-shell__content">
          {isSettingsRoute && (
            <div className="settings-underlay" aria-hidden="true" inert>
              <LibraryPage />
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              className="app-page-transition"
              variants={routeMotion.variants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={routeMotion.transition}
            >
              <Routes location={location}>
                <Route path="/" element={<LibraryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/book/:id" element={<BookDetailPage />} />
                <Route
                  path="/read/:bookId/:volumeNumber"
                  element={<ReaderPage />}
                />
                <Route path="/styleguide" element={<Styleguide />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </>
  )
}

function App() {
  return <AppRoutes />
}

export default App