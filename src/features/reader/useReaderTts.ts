import { useEffect, useRef, useState } from 'react'
import { saveProgress } from '../../data/libraryRepository.ts'
import type { ReaderBookSnapshot } from './useReaderBook.ts'
import type { LoadedReaderChapter } from './useReaderChapterContent.ts'
import type { ReaderChapterSegment, ReaderSegment } from './readerSegments.ts'
import { splitSpeechText } from './speechText.ts'
import type { TtsState } from './ttsEngine.ts'
import { WebSpeechEngine } from './ttsEngine.ts'
import { useSpeechVoices } from '../../lib/useSpeechVoices.ts'

type SpeechCursor = {
  chapterId: string
  sentenceIndex: number
  segmentIndex: number
}
type TtsActionHandlers = {
  play: () => void
  pause: () => void
  next: () => void
  previous: () => void
}
type WakeLockManager = {
  request: (type: 'screen') => Promise<{ release: () => Promise<void> }>
}
type NavigatorWithWakeLock = Navigator & { wakeLock?: WakeLockManager }

type UseReaderTtsOptions = {
  bookId: string
  bookTitle: string
  coverUrl?: string
  snapshot: ReaderBookSnapshot | null | undefined
  segments: readonly ReaderSegment[]
  activeSegment: number
  onActiveSegmentChange: (segmentIndex: number) => void
  loadedChapters: ReadonlyMap<string, LoadedReaderChapter>
  ensureChapterLoaded: (chapterId: string) => Promise<LoadedReaderChapter>
  speed: number
  preferredVoice: string
}

/**
 * Web Speech generally continues while desktop tabs remain active, but is not
 * guaranteed after mobile tabs are backgrounded. iOS Safari commonly suspends
 * speech on lock; Android Chrome behavior varies, so Wake Lock is best-effort.
 */
function getBackgroundSpeechNotice() {
  const userAgent = navigator.userAgent
  const ios =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1)
  const iosSafari =
    ios &&
    /Safari/.test(userAgent) &&
    !/(CriOS|FxiOS|EdgiOS|OPiOS)/.test(userAgent)
  if (iosSafari) {
    return 'iOS Safari may pause speech when the screen locks or this tab is backgrounded.'
  }
  const androidChrome =
    /Android/.test(userAgent) &&
    /Chrome/.test(userAgent) &&
    !/(EdgA|OPR|SamsungBrowser)/.test(userAgent)
  if (androidChrome) {
    return 'Android Chrome may pause speech after screen lock; Wake Lock is used when available, but background playback is not guaranteed.'
  }
  return null
}

function getCurrentChapter(
  segments: readonly ReaderSegment[],
  activeSegment: number,
): { chapter: ReaderChapterSegment; segmentIndex: number } | null {
  const active = segments[activeSegment]
  if (!active) return null
  if (active.kind === 'chapter')
    return { chapter: active, segmentIndex: activeSegment }
  for (let index = activeSegment - 1; index >= 0; index -= 1) {
    const candidate = segments[index]
    if (
      candidate?.kind === 'chapter' &&
      candidate.volumeId === active.volumeId
    ) {
      return { chapter: candidate, segmentIndex: index }
    }
  }
  return null
}

export function useReaderTts({
  bookId,
  bookTitle,
  coverUrl,
  snapshot,
  segments,
  activeSegment,
  onActiveSegmentChange,
  loadedChapters,
  ensureChapterLoaded,
  speed,
  preferredVoice,
}: UseReaderTtsOptions) {
  const { voices, supported } = useSpeechVoices()
  const [state, setState] = useState<TtsState>({ status: 'idle' })
  const [hasContinuePosition, setHasContinuePosition] = useState(false)
  const [runtimeNotice, setRuntimeNotice] = useState<string | null>(null)
  const engineRef = useRef<WebSpeechEngine | null>(null)
  const runIdRef = useRef(0)
  const startCursorRef = useRef<SpeechCursor | null>(null)
  const currentCursorRef = useRef<SpeechCursor | null>(null)
  const activeSegmentRef = useRef(activeSegment)
  const segmentsRef = useRef(segments)
  const snapshotRef = useRef(snapshot)
  const voicesRef = useRef(voices)
  const speedRef = useRef(speed)
  const preferredVoiceRef = useRef(preferredVoice)

  activeSegmentRef.current = activeSegment
  segmentsRef.current = segments
  snapshotRef.current = snapshot
  voicesRef.current = voices
  speedRef.current = speed
  preferredVoiceRef.current = preferredVoice

  const iosNotice =
    supported && typeof navigator !== 'undefined'
      ? getBackgroundSpeechNotice()
      : null
  const notice =
    runtimeNotice ??
    (supported ? iosNotice : 'Text-to-speech is not available in this browser.')

  useEffect(() => {
    if (!supported) return
    const engine = new WebSpeechEngine()
    engineRef.current = engine
    return () => {
      runIdRef.current += 1
      engine.cancel()
      engineRef.current = null
    }
  }, [supported])

  const findVisibleCursor = () => {
    const current = getCurrentChapter(
      segmentsRef.current,
      activeSegmentRef.current,
    )
    if (!current) return null
    const chapterElement = document.getElementById(current.chapter.id)
    const sentences = Array.from(
      chapterElement?.querySelectorAll<HTMLElement>(
        '[data-tts-sentence-index]',
      ) ?? [],
    )
    const centerY = window.innerHeight * 0.45
    const visible = sentences
      .map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.bottom > 0 && rect.top < window.innerHeight)
      .sort(
        (first, second) =>
          Math.abs(first.rect.top - centerY) -
          Math.abs(second.rect.top - centerY),
      )[0]?.element
    const sentenceIndex = Number(visible?.dataset.ttsSentenceIndex)
    const savedProgress = snapshotRef.current?.volumes.find(
      ({ volume }) => volume.id === current.chapter.volumeId,
    )?.progress
    return {
      chapterId: current.chapter.id,
      segmentIndex: current.segmentIndex,
      sentenceIndex: Number.isInteger(sentenceIndex)
        ? sentenceIndex
        : (savedProgress?.position.sentenceIndex ?? 0),
    }
  }

  const updateActiveSentence = (
    chapterId: string,
    sentenceIndex: number,
    segmentIndex: number,
  ) => {
    document
      .querySelector<HTMLElement>('[data-tts-active="true"]')
      ?.removeAttribute('data-tts-active')
    const sentence = document
      .getElementById(chapterId)
      ?.querySelector<HTMLElement>(
        `[data-tts-sentence-index="${sentenceIndex}"]`,
      )
    sentence?.setAttribute('data-tts-active', 'true')
    sentence?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
    const cursor = { chapterId, sentenceIndex, segmentIndex }
    currentCursorRef.current = cursor
    activeSegmentRef.current = segmentIndex
    onActiveSegmentChange(segmentIndex)
  }

  const persistTtsProgress = async (
    segment: ReaderChapterSegment,
    sentenceIndex: number,
    sentenceCount: number,
  ) => {
    const currentSnapshot = snapshotRef.current
    if (!currentSnapshot) return
    const volumeSnapshot = currentSnapshot.volumes.find(
      ({ volume }) => volume.id === segment.volumeId,
    )
    if (!volumeSnapshot) return

    const volumeChapters = segmentsRef.current.filter(
      (candidate) =>
        candidate.kind === 'chapter' && candidate.volumeId === segment.volumeId,
    )
    const percent = Math.min(
      100,
      Math.round(
        ((segment.chapterIndex +
          (sentenceIndex + 1) / Math.max(1, sentenceCount)) /
          Math.max(1, volumeChapters.length)) *
          100,
      ),
    )
    const chapter = document.getElementById(segment.id)
    const chapterTop = chapter
      ? chapter.getBoundingClientRect().top + window.scrollY
      : window.scrollY

    try {
      await saveProgress(
        volumeSnapshot.volume.stableKey,
        volumeSnapshot.volume.id,
        bookId,
        {
          chapterIndex: segment.chapterIndex,
          sentenceIndex,
          pageIndex: volumeSnapshot.progress?.position.pageIndex ?? 0,
          scrollOffset: Math.max(0, window.scrollY - chapterTop),
        },
        percent,
      )
    } catch (error) {
      setRuntimeNotice(
        error instanceof Error
          ? error.message
          : 'Storage is full. Reading progress could not be saved.',
      )
    }
  }

  const startPlayback = async (requestedCursor?: SpeechCursor | null) => {
    const engine = engineRef.current
    if (!supported || !engine) {
      setState({ status: 'error', message: 'Text-to-speech is unavailable.' })
      return
    }

    const cursor =
      requestedCursor ??
      startCursorRef.current ??
      currentCursorRef.current ??
      findVisibleCursor()
    if (!cursor) {
      setState({
        status: 'error',
        message: 'No readable sentence is available here.',
      })
      return
    }

    const runId = ++runIdRef.current
    startCursorRef.current = null
    setHasContinuePosition(false)
    currentCursorRef.current = cursor
    setRuntimeNotice(null)
    setState({ status: 'playing' })

    const speak = async (text: string) => {
      for (const chunk of splitSpeechText(text)) {
        if (runIdRef.current !== runId) return false
        const voice =
          voicesRef.current.find(
            (candidate) => candidate.voiceURI === preferredVoiceRef.current,
          ) ?? null
        await engine.speak(chunk, voice, speedRef.current)
        if (runIdRef.current !== runId) return false
      }
      return true
    }

    try {
      const currentSegments = segmentsRef.current
      for (
        let segmentIndex = cursor.segmentIndex;
        segmentIndex < currentSegments.length;
        segmentIndex += 1
      ) {
        if (runIdRef.current !== runId) return
        const segment = currentSegments[segmentIndex]
        if (!segment) continue

        if (segment.kind === 'volume-end') {
          if (segment.nextVolumeNumber !== null) {
            activeSegmentRef.current = segmentIndex
            onActiveSegmentChange(segmentIndex)
            const announcement = `End of Volume ${segment.volumeNumber}. Starting Volume ${segment.nextVolumeNumber} in 3, 2, 1.`
            if (!(await speak(announcement))) return
          }
          continue
        }

        activeSegmentRef.current = segmentIndex
        onActiveSegmentChange(segmentIndex)
        const chapter =
          loadedChapters.get(segment.id) ??
          (await ensureChapterLoaded(segment.id))
        await new Promise<void>((resolve) =>
          window.requestAnimationFrame(() => resolve()),
        )
        const firstSentence =
          segmentIndex === cursor.segmentIndex ? cursor.sentenceIndex : 0

        for (
          let sentenceIndex = firstSentence;
          sentenceIndex < chapter.sentences.length;
          sentenceIndex += 1
        ) {
          if (runIdRef.current !== runId) return
          updateActiveSentence(segment.id, sentenceIndex, segmentIndex)
          const sentence = chapter.sentences[sentenceIndex]
          if (!sentence) continue
          const chunks = splitSpeechText(sentence)
          for (const chunk of chunks) {
            if (runIdRef.current !== runId) return
            const voice =
              voicesRef.current.find(
                (candidate) => candidate.voiceURI === preferredVoiceRef.current,
              ) ?? null
            await engine.speak(chunk, voice, speedRef.current)
            if (runIdRef.current !== runId) return
            await persistTtsProgress(
              segment,
              sentenceIndex,
              chapter.sentences.length,
            )
          }
          currentCursorRef.current = {
            chapterId: segment.id,
            sentenceIndex: sentenceIndex + 1,
            segmentIndex,
          }
        }
      }

      if (runIdRef.current === runId) {
        currentCursorRef.current = null
        setState({ status: 'idle' })
      }
    } catch (error) {
      if (runIdRef.current !== runId) return
      if (error instanceof DOMException && error.name === 'AbortError') {
        setState({ status: 'idle' })
      } else {
        setState({
          status: 'error',
          message:
            error instanceof Error ? error.message : 'Speech playback failed.',
        })
      }
    }
  }

  const pausePlayback = () => {
    engineRef.current?.pause()
    setState({ status: 'paused' })
  }

  const togglePlayback = () => {
    if (state.status === 'playing') {
      pausePlayback()
    } else if (state.status === 'paused') {
      engineRef.current?.resume()
      setState({ status: 'playing' })
    } else {
      void startPlayback()
    }
  }

  const continueFromHere = () => {
    const cursor = startCursorRef.current ?? findVisibleCursor()
    engineRef.current?.cancel()
    runIdRef.current += 1
    setState({ status: 'idle' })
    setHasContinuePosition(false)
    void startPlayback(cursor)
  }

  const onSentenceSelect = (
    chapterId: string,
    sentenceIndex: number,
    segmentIndex: number,
  ) => {
    const cursor = { chapterId, sentenceIndex, segmentIndex }
    startCursorRef.current = cursor
    currentCursorRef.current = cursor
    setHasContinuePosition(true)
    if (state.status === 'playing' || state.status === 'paused') {
      engineRef.current?.cancel()
      runIdRef.current += 1
      setState({ status: 'idle' })
    }
    updateActiveSentence(chapterId, sentenceIndex, segmentIndex)
  }

  const jumpToChapter = (chapterId: string, segmentIndex: number) => {
    const wasPlaying = state.status === 'playing'
    engineRef.current?.cancel()
    runIdRef.current += 1
    const cursor = { chapterId, sentenceIndex: 0, segmentIndex }
    startCursorRef.current = cursor
    currentCursorRef.current = cursor
    setHasContinuePosition(true)
    setState({ status: 'idle' })
    if (wasPlaying) void startPlayback(cursor)
  }

  const nextChapter = (direction: number) => {
    const chapters = segmentsRef.current.flatMap((segment, segmentIndex) =>
      segment.kind === 'chapter' ? [{ segment, segmentIndex }] : [],
    )
    const current = getCurrentChapter(
      segmentsRef.current,
      activeSegmentRef.current,
    )
    const chapterIndex = chapters.findIndex(
      ({ segment }) => segment.id === current?.chapter.id,
    )
    const next = chapters[chapterIndex + direction]
    if (next) jumpToChapter(next.segment.id, next.segmentIndex)
  }

  const actionHandlersRef = useRef<TtsActionHandlers>({
    play: () => undefined,
    pause: () => undefined,
    next: () => undefined,
    previous: () => undefined,
  })
  actionHandlersRef.current = {
    play: () => {
      if (state.status === 'paused') {
        engineRef.current?.resume()
        setState({ status: 'playing' })
      } else {
        void startPlayback()
      }
    },
    pause: pausePlayback,
    next: () => nextChapter(1),
    previous: () => nextChapter(-1),
  }

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ['play', () => actionHandlersRef.current.play()],
      ['pause', () => actionHandlersRef.current.pause()],
      ['nexttrack', () => actionHandlersRef.current.next()],
      ['previoustrack', () => actionHandlersRef.current.previous()],
    ]
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler)
      } catch {
        // Ignore unsupported Media Session actions.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null)
        } catch {
          // Ignore unsupported Media Session actions.
        }
      }
      session.metadata = null
    }
  }, [])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState =
      state.status === 'playing'
        ? 'playing'
        : state.status === 'paused'
          ? 'paused'
          : 'none'
  }, [state.status])

  const activeSegmentData = segmentsRef.current[activeSegmentRef.current]
  const currentVolumeTitle = activeSegmentData?.volumeTitle ?? ''
  const currentChapterTitle =
    activeSegmentData?.kind === 'chapter'
      ? activeSegmentData.title
      : 'Reading aloud'
  useEffect(() => {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined')
      return
    navigator.mediaSession.metadata = new MediaMetadata({
      title: bookTitle,
      artist: currentVolumeTitle,
      album: currentChapterTitle,
      ...(coverUrl ? { artwork: [{ src: coverUrl }] } : {}),
    })
  }, [bookTitle, coverUrl, currentChapterTitle, currentVolumeTitle])

  useEffect(() => {
    if (state.status !== 'playing') return
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock
    if (!wakeLock) return
    let sentinel: { release: () => Promise<void> } | null = null
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        sentinel = await wakeLock.request('screen')
      } catch {
        sentinel = null
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) void acquire()
    }
    void acquire()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      if (sentinel) void sentinel.release()
    }
  }, [state.status])

  return {
    state,
    voices,
    supported,
    notice,
    hasContinuePosition,
    onPlayPause: togglePlayback,
    onContinue: continueFromHere,
    onSentenceSelect,
    onChapterJump: jumpToChapter,
    cancel: () => {
      engineRef.current?.cancel()
      runIdRef.current += 1
      setState({ status: 'idle' })
    },
  }
}
