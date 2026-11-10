import { FolderOpen, LoaderCircle } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Button } from '../../components/ui/Button.tsx'
import { resolveMotionPreset } from '../../lib/motion.ts'

export type OnboardingMode = 'new' | 'missing' | 'unsupported'

type OnboardingPageProps = {
  appName: string
  mode: OnboardingMode
  busy: boolean
  error: string
  onChooseFolder: () => void
  onUseInAppStorage: () => void
}

export function StorageSplash({ appName }: { appName: string }) {
  const reduceMotion = useReducedMotion()
  const animation = resolveMotionPreset('fade', Boolean(reduceMotion))

  return (
    <motion.main
      className="storage-splash"
      aria-label={appName}
      variants={animation.variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={animation.transition}
    >
      <h1>{appName}</h1>
    </motion.main>
  )
}

export function OnboardingPage({
  appName,
  mode,
  busy,
  error,
  onChooseFolder,
  onUseInAppStorage,
}: OnboardingPageProps) {
  const reduceMotion = useReducedMotion()
  const animation = resolveMotionPreset('pageTransition', Boolean(reduceMotion))
  const unsupported = mode === 'unsupported'

  return (
    <motion.main
      className="storage-onboarding"
      variants={animation.variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={animation.transition}
    >
      <section className="storage-onboarding__content" aria-labelledby="storage-onboarding-title">
        <p className="storage-onboarding__name">{appName}</p>
        <h1 id="storage-onboarding-title">
          {mode === 'missing'
            ? 'Reconnect your library'
            : unsupported
              ? 'Keep your library on this device'
              : 'Choose where your library lives'}
        </h1>
        <p className="storage-onboarding__description">
          {mode === 'missing'
            ? 'Choose the same folder again to restore your books, settings, and reading progress.'
            : unsupported
              ? 'This browser cannot access device folders. Use in-app storage; your books and progress stay in this browser.'
              : 'liber reads light novels from a folder on your device and stores settings and reading progress there. Nothing leaves this device.'}
        </p>
        {unsupported ? (
          <Button
            type="button"
            variant="primary"
            size="large"
            disabled={busy}
            onClick={onUseInAppStorage}
          >
            {busy ? (
              <LoaderCircle size={17} className="is-spinning" aria-hidden="true" />
            ) : (
              <FolderOpen size={17} aria-hidden="true" />
            )}
            Use in-app storage
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="large"
            disabled={busy}
            onClick={onChooseFolder}
          >
            {busy ? (
              <LoaderCircle size={17} className="is-spinning" aria-hidden="true" />
            ) : (
              <FolderOpen size={17} aria-hidden="true" />
            )}
            {busy ? 'Connecting folder' : 'Choose folder'}
          </Button>
        )}
        {!unsupported && (
          <p className="storage-onboarding__hint">
            Choose or create a regular folder. Browsers may refuse system folders such as Downloads or drive roots.
          </p>
        )}
        {error && (
          <p className="storage-onboarding__error" role="alert">
            {error}
          </p>
        )}
      </section>
    </motion.main>
  )
}