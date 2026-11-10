import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from '../../components/ui/Button.tsx'
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx'
import type { ThemeMode } from '../../lib/theme.tsx'
import { motionPresets, resolveMotionPreset } from '../../lib/motion.ts'
import type { MotionPresetName } from '../../lib/motion.ts'
import { useTheme } from '../../lib/theme.tsx'
import { StyleguideComponents } from './StyleguideComponents.tsx'

const themeOptions = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'System', value: 'system' },
] as const

const motionDemoNames: readonly Exclude<
  MotionPresetName,
  'listContainer' | 'pageTransition'
>[] = [
  'fade',
  'popIn',
  'slideDown',
  'slideUp',
  'listItem',
  'press',
  'springBounce',
]

function MotionPresetDemo({
  name,
}: {
  name: (typeof motionDemoNames)[number]
}) {
  const reduceMotion = useReducedMotion()
  const [revision, setRevision] = useState(0)
  const isPress = name === 'press'
  const preset = isPress
    ? null
    : resolveMotionPreset(name, Boolean(reduceMotion))

  return (
    <article className="styleguide-motion-demo">
      <p className="styleguide-motion-demo__name">{name}</p>
      {isPress ? (
        <Button
          type="button"
          variant="secondary"
          className="styleguide-motion-demo__target"
          whileTap={reduceMotion ? undefined : motionPresets.press.whileTap}
          transition={motionPresets.press.transition}
        >
          Press to preview
        </Button>
      ) : (
        <>
          <div className="styleguide-motion-demo__stage">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={revision}
                className="styleguide-motion-demo__target"
                variants={preset?.variants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={preset?.transition}
              >
                {name}
              </motion.div>
            </AnimatePresence>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setRevision((current) => current + 1)}
          >
            Replay
          </Button>
        </>
      )}
    </article>
  )
}

export function Styleguide() {
  const { theme, setTheme } = useTheme()

  return (
    <main className="styleguide">
      <header className="styleguide__header">
        <h1 className="styleguide__title">Styleguide</h1>
        <div className="styleguide__theme-control">
          <span className="styleguide__theme-label">Appearance</span>
          <SegmentedControl<ThemeMode>
            label="Appearance"
            value={theme}
            options={themeOptions}
            onChange={setTheme}
          />
        </div>
      </header>
      <div className="styleguide__panels">
        <StyleguideComponents theme="light" />
        <StyleguideComponents theme="dark" />
      </div>
      <section
        className="styleguide-motion"
        aria-labelledby="motion-presets-title"
      >
        <h2 id="motion-presets-title" className="styleguide__section-title">
          Motion presets
        </h2>
        <div className="styleguide-motion-gallery">
          {motionDemoNames.map((name) => (
            <MotionPresetDemo key={name} name={name} />
          ))}
        </div>
      </section>
    </main>
  )
}
