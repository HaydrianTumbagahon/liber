import { List, LocateFixed, Pause, Play, Type } from 'lucide-react'
import { Button } from '../../components/ui/Button.tsx'
import type { TtsState } from './ttsEngine.ts'

type ReaderControlsProps = {
  ttsState: TtsState
  speed: number
  voice: string
  voices: readonly SpeechSynthesisVoice[]
  speechSupported: boolean
  notice: string | null
  continueActive: boolean
  onPlayPause: () => void
  onSpeedChange: (speed: number) => void
  onVoiceChange: (voice: string) => void
  onContinue: () => void
  onOpenChapters: () => void
  onOpenTextSettings: () => void
}

export function ReaderControls({
  ttsState,
  speed,
  voice,
  voices,
  speechSupported,
  notice,
  continueActive,
  onPlayPause,
  onSpeedChange,
  onVoiceChange,
  onContinue,
  onOpenChapters,
  onOpenTextSettings,
}: ReaderControlsProps) {
  const playing = ttsState.status === 'playing'
  const noVoicesMessage =
    speechSupported && voices.length === 0
      ? 'No speech voices are available on this device yet.'
      : null
  const message =
    notice ??
    noVoicesMessage ??
    (ttsState.status === 'error' ? ttsState.message : null)
  return (
    <footer className="reader-controls" aria-label="Reading controls">
      <Button
        type="button"
        variant={playing ? 'primary' : 'secondary'}
        size="large"
        className="reader-controls__play"
        aria-label={playing ? 'Pause' : 'Play'}
        aria-pressed={playing}
        disabled={!speechSupported}
        onClick={onPlayPause}
      >
        {playing ? (
          <Pause size={21} fill="currentColor" aria-hidden="true" />
        ) : (
          <Play size={21} fill="currentColor" aria-hidden="true" />
        )}
      </Button>
      <Button
        type="button"
        variant={continueActive ? 'primary' : 'secondary'}
        size="large"
        className="reader-controls__continue"
        aria-pressed={continueActive}
        onClick={onContinue}
      >
        <LocateFixed size={17} aria-hidden="true" />
        Continue from here
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="large"
        className="reader-controls__chapters"
        aria-label="Jump to chapter"
        onClick={onOpenChapters}
      >
        <List size={18} aria-hidden="true" />
        Chapters
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="large"
        className="reader-controls__text"
        onClick={onOpenTextSettings}
      >
        <Type size={17} aria-hidden="true" />
        Text
      </Button>
      <div className="reader-controls__selects">
        <label className="reader-controls__select reader-controls__speed">
          <span>Speed</span>
          <output>{speed.toFixed(1)}x</output>
          <input
            type="range"
            min="0.7"
            max="2"
            step="0.1"
            value={speed}
            aria-label="Speech speed"
            onChange={(event) => onSpeedChange(Number(event.target.value))}
          />
        </label>
        <label className="reader-controls__select reader-controls__voice">
          <span>Voice</span>
          <select
            value={voices.some((item) => item.voiceURI === voice) ? voice : ''}
            disabled={!speechSupported}
            onChange={(event) => onVoiceChange(event.target.value)}
          >
            <option value="">System default</option>
            {voices.map((item) => (
              <option value={item.voiceURI} key={item.voiceURI}>
                {item.name} ({item.lang})
              </option>
            ))}
          </select>
        </label>
      </div>
      {message && (
        <p className="reader-controls__notice" role="status">
          {message}
        </p>
      )}
    </footer>
  )
}
