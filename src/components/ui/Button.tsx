import { motion, useReducedMotion } from 'framer-motion'
import type { HTMLMotionProps } from 'framer-motion'
import { motionPresets } from '../../lib/motion.ts'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'icon'

export type ButtonProps = Omit<
  HTMLMotionProps<'button'>,
  'color' | 'size' | 'title'
> & {
  variant?: ButtonVariant
  size?: 'normal' | 'large'
}

export function Button({
  variant = 'secondary',
  size = 'normal',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const reduceMotion = useReducedMotion()
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    size === 'large' ? 'ui-button--large' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <motion.button
      className={classes}
      whileTap={reduceMotion ? undefined : motionPresets.press.whileTap}
      transition={motionPresets.press.transition}
      {...props}
    >
      {children}
    </motion.button>
  )
}
