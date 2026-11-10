import { useEffect, useState } from 'react'

export function useSpeechVoices() {
  const supported =
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if (!supported) return
    const synthesis = window.speechSynthesis
    const updateVoices = () => setVoices(synthesis.getVoices())
    updateVoices()
    synthesis.addEventListener('voiceschanged', updateVoices)
    return () => synthesis.removeEventListener('voiceschanged', updateVoices)
  }, [supported])

  return { voices, supported }
}
