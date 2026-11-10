const MAX_UTTERANCE_LENGTH = 240

function wordSegments(text: string) {
  if (typeof Intl.Segmenter === 'function') {
    return [
      ...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text),
    ].map((segment) => segment.segment)
  }
  return text.match(/\S+\s*|\s+/gu) ?? [text]
}

export function splitSpeechText(sentence: string) {
  const words = wordSegments(sentence)
  const chunks: string[] = []
  let current = ''

  for (const word of words) {
    if (current.length + word.length <= MAX_UTTERANCE_LENGTH) {
      current += word
      continue
    }

    if (current.trim()) chunks.push(current.trim())
    if (word.length <= MAX_UTTERANCE_LENGTH) {
      current = word
      continue
    }

    const characters = Array.from(word)
    while (characters.length > MAX_UTTERANCE_LENGTH) {
      chunks.push(characters.splice(0, MAX_UTTERANCE_LENGTH).join(''))
    }
    current = characters.join('')
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
}
