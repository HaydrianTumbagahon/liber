export interface TtsEngine {
  speak(
    text: string,
    voice: SpeechSynthesisVoice | null,
    rate: number,
  ): Promise<void>
  pause(): void
  resume(): void
  cancel(): void
}

export type TtsState =
  | { status: 'idle' }
  | { status: 'playing' }
  | { status: 'paused' }
  | { status: 'error'; message: string }

export class WebSpeechEngine implements TtsEngine {
  private readonly synthesis: SpeechSynthesis
  private rejectCurrent: (() => void) | null = null
  private keepAliveTimer: number | null = null

  constructor(synthesis = window.speechSynthesis) {
    this.synthesis = synthesis
  }

  speak(
    text: string,
    voice: SpeechSynthesisVoice | null,
    rate: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = Math.min(2, Math.max(0.7, rate))
      if (voice) utterance.voice = voice

      let settled = false
      const finish = (error?: Error) => {
        if (settled) return
        settled = true
        utterance.onend = null
        utterance.onerror = null
        this.rejectCurrent = null
        this.stopKeepAlive()
        if (error) reject(error)
        else resolve()
      }

      this.rejectCurrent = () =>
        finish(new DOMException('Speech was stopped.', 'AbortError'))
      utterance.onend = () => finish()
      utterance.onerror = (event) => {
        if (event.error === 'canceled' || event.error === 'interrupted') {
          finish(new DOMException('Speech was stopped.', 'AbortError'))
        } else {
          finish(new Error(`Speech failed: ${event.error}.`))
        }
      }

      this.synthesis.speak(utterance)
      this.keepAliveTimer = window.setInterval(() => {
        if (!this.synthesis.paused && this.synthesis.speaking) {
          this.synthesis.resume()
        }
      }, 10000)
    })
  }

  pause() {
    this.synthesis.pause()
  }

  resume() {
    this.synthesis.resume()
  }

  cancel() {
    this.synthesis.cancel()
    this.rejectCurrent?.()
    this.stopKeepAlive()
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer === null) return
    window.clearInterval(this.keepAliveTimer)
    this.keepAliveTimer = null
  }
}
