import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, LoaderCircle } from 'lucide-react'
import { resolveMotionPreset } from '../../lib/motion.ts'

type BannerState =
  { status: 'hidden' } | { status: 'working' | 'done'; message: string }

type StatusBannerContextValue = {
  working: (message: string) => void
  done: (message: string) => void
  hide: () => void
}

const StatusBannerContext = createContext<StatusBannerContextValue | null>(null)

export function useStatusBanner() {
  const context = useContext(StatusBannerContext)
  if (!context) {
    throw new Error('useStatusBanner must be used within StatusBannerProvider.')
  }
  return context
}

export function StatusBannerProvider({ children }: { children: ReactNode }) {
  const [banner, setBanner] = useState<BannerState>({ status: 'hidden' })
  const timeout = useRef<number | null>(null)
  const hide = useCallback(() => {
    if (timeout.current !== null) window.clearTimeout(timeout.current)
    timeout.current = null
    setBanner({ status: 'hidden' })
  }, [])
  const working = useCallback((message: string) => {
    if (timeout.current !== null) window.clearTimeout(timeout.current)
    timeout.current = null
    setBanner({ status: 'working', message })
  }, [])
  const done = useCallback((message: string) => {
    if (timeout.current !== null) window.clearTimeout(timeout.current)
    setBanner({ status: 'done', message })
    timeout.current = window.setTimeout(() => {
      timeout.current = null
      setBanner({ status: 'hidden' })
    }, 2400)
  }, [])

  useEffect(
    () => () => {
      if (timeout.current !== null) window.clearTimeout(timeout.current)
    },
    [],
  )

  return (
    <StatusBannerContext.Provider value={{ working, done, hide }}>
      {children}
      <StatusBannerView banner={banner} />
    </StatusBannerContext.Provider>
  )
}

function StatusBannerView({ banner }: { banner: BannerState }) {
  const reduceMotion = useReducedMotion()
  const animation = resolveMotionPreset('slideDown', Boolean(reduceMotion))

  return (
    <AnimatePresence>
      {banner.status !== 'hidden' && (
        <motion.div
          key="status-banner"
          className={`ui-status-banner ui-status-banner--${banner.status}`}
          role="status"
          aria-live="polite"
          variants={animation.variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={animation.transition}
        >
          {banner.status === 'working' ? (
            <LoaderCircle
              size={16}
              className="ui-status-banner__spinner"
              aria-hidden="true"
            />
          ) : (
            <Check size={16} aria-hidden="true" />
          )}
          <span>{banner.message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
