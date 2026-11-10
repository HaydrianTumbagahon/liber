import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { AppNavigation } from './components/AppNavigation.tsx'
import { Toast } from './components/ui/Toast.tsx'
import { BookDetailPage } from './features/book/BookDetailPage.tsx'
import { LibraryPage } from './features/library/LibraryPage.tsx'
import { ReaderPage } from './features/reader/ReaderPage.tsx'
import { SettingsPage } from './features/settings/SettingsPage.tsx'
import { Styleguide } from './features/settings/Styleguide.tsx'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isIOSInstallHintSupported() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function AppRoutes() {
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const isReaderRoute = location.pathname.startsWith('/read/')
  const isSettingsRoute = location.pathname === '/settings'
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [showUpdateToast, setShowUpdateToast] = useState(false)
  const updateServiceWorkerRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null)
  const [showIOSHint, setShowIOSHint] = useState(() => {
    if (!isIOSInstallHintSupported()) return false
    try {
      return localStorage.getItem('liber-ios-install-hint-dismissed') !== 'true'
    } catch {
      return true
    }
  })

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setShowUpdateToast(true)
      },
      onOfflineReady() {
        setShowUpdateToast(false)
      },
    })
    updateServiceWorkerRef.current = updateSW

    const installHandler = (event: Event) => {
      event.preventDefault()
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent)
      setShowInstallPrompt(true)
    }

    const appInstalledHandler = () => {
      setShowInstallPrompt(false)
      setDeferredInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', installHandler)
    window.addEventListener('appinstalled', appInstalledHandler)

    return () => {
      window.removeEventListener('beforeinstallprompt', installHandler)
      window.removeEventListener('appinstalled', appInstalledHandler)
    }
  }, [])

  const dismissIOSHint = () => {
    setShowIOSHint(false)
    try {
      localStorage.setItem('liber-ios-install-hint-dismissed', 'true')
    } catch {
      // Ignore if storage is blocked.
    }
  }

  const installApp = async () => {
    if (!deferredInstallPrompt) return
    await deferredInstallPrompt.prompt()
    await deferredInstallPrompt.userChoice
    setDeferredInstallPrompt(null)
    setShowInstallPrompt(false)
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
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.14, ease: 'linear' }}
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

      {showInstallPrompt && deferredInstallPrompt && (
        <div className="pwa-install-banner" role="status">
          <span>Install liber for offline reading.</span>
          <button type="button" onClick={() => void installApp()}>
            Install
          </button>
          <button
            type="button"
            className="pwa-install-banner__dismiss"
            onClick={() => {
              setShowInstallPrompt(false)
              setDeferredInstallPrompt(null)
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {showIOSHint && (
        <div className="pwa-ios-hint" role="status">
          <strong>Add liber to your Home Screen</strong>
          <span>Tap Share, then Add to Home Screen.</span>
          <button type="button" onClick={dismissIOSHint}>
            Dismiss
          </button>
        </div>
      )}

      <Toast
        message={showUpdateToast ? 'App update ready. Refresh to install.' : null}
        onDismiss={() => setShowUpdateToast(false)}
        actionLabel="Refresh"
        onAction={() => {
          setShowUpdateToast(false)
          if (updateServiceWorkerRef.current) {
            void updateServiceWorkerRef.current(true)
          }
        }}
      />
    </>
  )
}

function App() {
  return <AppRoutes />
}

export default App
