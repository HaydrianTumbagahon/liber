type ProgressBarProps = {
  value: number
  label: string
  showValue?: boolean
  className?: string
}

export function ProgressBar({
  value,
  label,
  showValue = false,
  className = '',
}: ProgressBarProps) {
  const progress = Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : 0

  return (
    <div className={`ui-progress ${className}`.trim()}>
      <progress
        className="ui-progress__bar"
        value={progress}
        max={100}
        aria-label={label}
      />
      {showValue && (
        <span className="ui-progress__value">{progress.toLocaleString()}%</span>
      )}
    </div>
  )
}
