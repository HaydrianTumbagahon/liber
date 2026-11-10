import type { Transition, Variants } from 'framer-motion'

export const motionDurations = {
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
} as const

export const motionEasings = {
  standard: [0.2, 0.8, 0.2, 1] as const,
  enter: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  spring: [0.34, 1.2, 0.64, 1] as const,
}

type MotionPreset = {
  variants: Variants
  transition: Transition
}

export const motionPresets = {
  fade: {
    variants: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    transition: {
      duration: motionDurations.base,
      ease: motionEasings.standard,
    },
  },
  popIn: {
    variants: {
      initial: { opacity: 0, scale: 0.98 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.99 },
    },
    transition: { duration: motionDurations.base, ease: motionEasings.enter },
  },
  slideDown: {
    variants: {
      initial: { opacity: 0, y: -8 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -8 },
    },
    transition: {
      duration: motionDurations.fast,
      ease: motionEasings.standard,
    },
  },
  slideUp: {
    variants: {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: 8 },
    },
    transition: {
      duration: motionDurations.fast,
      ease: motionEasings.standard,
    },
  },
  listItem: {
    variants: {
      initial: { opacity: 0, y: 6 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0 },
    },
    transition: {
      duration: motionDurations.base,
      ease: motionEasings.standard,
    },
  },
  listContainer: {
    variants: {
      initial: {},
      animate: {
        transition: { staggerChildren: 0.04, delayChildren: 0.02 },
      },
    },
    transition: {
      duration: motionDurations.base,
      ease: motionEasings.standard,
    },
  },
  pageTransition: {
    variants: {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -8 },
    },
    transition: {
      duration: motionDurations.base,
      ease: motionEasings.standard,
    },
  },
  press: {
    whileTap: { scale: 0.97 },
    transition: {
      duration: motionDurations.fast,
      ease: motionEasings.standard,
    },
  },
  springBounce: {
    variants: {
      initial: { opacity: 0, scale: 0.97 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.99 },
    },
    transition: {
      duration: motionDurations.base,
      ease: motionEasings.spring,
    },
  },
} satisfies Record<
  string,
  MotionPreset | { whileTap: { scale: number }; transition: Transition }
>

export type MotionPresetName = keyof typeof motionPresets

export function resolveMotionPreset(
  name: Exclude<MotionPresetName, 'press'>,
  reduceMotion: boolean,
): MotionPreset {
  const preset = motionPresets[name] as MotionPreset
  if (!reduceMotion) return preset

  return {
    variants: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    transition: {
      duration: motionDurations.fast,
      ease: motionEasings.standard,
    },
  }
}
