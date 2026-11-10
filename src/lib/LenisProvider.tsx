import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

type LenisContextValue = {
  lenis: Lenis | null
  acquireLock: () => () => void
}

const LenisContext = createContext<LenisContextValue | null>(null)

export function LenisProvider({ children }: { children: ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null)
  const lenisRef = useRef<Lenis | null>(null)
  const lockCount = useRef(0)

  const acquireLock = useCallback(() => {
    lockCount.current += 1
    lenisRef.current?.stop()
    let released = false

    return () => {
      if (released) return
      released = true
      lockCount.current = Math.max(0, lockCount.current - 1)
      if (lockCount.current === 0) lenisRef.current?.start()
    }
  }, [])

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let instance: Lenis | null = null

    const syncInstance = () => {
      if (reducedMotion.matches) {
        instance?.destroy()
        instance = null
        lenisRef.current = null
        setLenis(null)
        return
      }

      if (!instance) {
        instance = new Lenis({
          autoRaf: true,
          prevent: (node) => node.closest('[data-lenis-prevent]') !== null,
        })
        lenisRef.current = instance
        if (lockCount.current > 0) instance.stop()
        setLenis(instance)
      }
    }

    syncInstance()
    reducedMotion.addEventListener('change', syncInstance)

    return () => {
      reducedMotion.removeEventListener('change', syncInstance)
      instance?.destroy()
      lenisRef.current = null
    }
  }, [])

  return (
    <LenisContext.Provider value={{ lenis, acquireLock }}>
      {children}
    </LenisContext.Provider>
  )
}

export function useLenis() {
  return useContext(LenisContext)?.lenis ?? null
}

export function useLenisLock() {
  return useContext(LenisContext)?.acquireLock ?? (() => () => undefined)
}
