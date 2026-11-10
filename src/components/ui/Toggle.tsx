import { motion, useReducedMotion } from 'framer-motion'

type ToggleProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: ToggleProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      className="ui-toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.08 }}
    >
      <span className="ui-toggle__track" data-checked={checked}>
        <span className="ui-toggle__thumb" />
      </span>
      <span>{label}</span>
    </motion.button>
  )
}
