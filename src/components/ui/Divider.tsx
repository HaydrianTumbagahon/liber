type DividerProps = {
  orientation?: 'horizontal' | 'vertical'
}

export function Divider({ orientation = 'horizontal' }: DividerProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={`ui-divider ui-divider--${orientation}`}
    />
  )
}
