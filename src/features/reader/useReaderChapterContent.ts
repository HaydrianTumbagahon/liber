import { useEffect, useRef, useState } from 'react'
import { readStoredEpubChapter } from '../../data/epubContent.ts'
import type { SanitizedChapter } from './sanitizeEpubHtml.ts'
import { sanitizeEpubHtml } from './sanitizeEpubHtml.ts'
import type { ReaderChapterSegment, ReaderSegment } from './readerSegments.ts'

export type LoadedReaderChapter = SanitizedChapter & { id: string }

type ReaderChapterContent = {
  loaded: ReadonlyMap<string, LoadedReaderChapter>
  errors: ReadonlyMap<string, string>
  ensureLoaded: (chapterId: string) => Promise<LoadedReaderChapter>
}

function getWantedChapters(
  segments: readonly ReaderSegment[],
  activeSegment: number,
) {
  const nearby = segments.slice(
    Math.max(0, activeSegment - 1),
    Math.min(segments.length, activeSegment + 2),
  )
  const wanted = new Map<string, ReaderChapterSegment>()
  for (const segment of nearby) {
    if (segment.kind === 'chapter') wanted.set(segment.id, segment)
    if (segment.kind === 'volume-end' && segment.nextPreviewId) {
      const preview = segments.find(
        (candidate) => candidate.id === segment.nextPreviewId,
      )
      if (preview?.kind === 'chapter') wanted.set(preview.id, preview)
    }
  }
  return wanted
}

export function useReaderChapterContent(
  segments: readonly ReaderSegment[],
  activeSegment: number,
): ReaderChapterContent {
  const [loaded, setLoaded] = useState<
    ReadonlyMap<string, LoadedReaderChapter>
  >(() => new Map())
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  )
  const loadedRef = useRef(new Map<string, LoadedReaderChapter>())
  const errorsRef = useRef(new Map<string, string>())
  const loadingRef = useRef(new Map<string, Promise<LoadedReaderChapter>>())
  const wantedRef = useRef(new Set<string>())
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments

  const ensureLoaded = (chapterId: string) => {
    const cached = loadedRef.current.get(chapterId)
    if (cached) return Promise.resolve(cached)
    const pending = loadingRef.current.get(chapterId)
    if (pending) return pending
    const segment = segmentsRef.current.find(
      (candidate) => candidate.id === chapterId && candidate.kind === 'chapter',
    )
    if (!segment || segment.kind !== 'chapter') {
      return Promise.reject(new Error('The requested chapter is unavailable.'))
    }

    wantedRef.current.add(chapterId)
    const request = readStoredEpubChapter(segment.volumeId, segment.href)
      .then((chapter) => {
        const sanitized = sanitizeEpubHtml(
          chapter.html,
          segment.href,
          chapter.assets,
        )
        errorsRef.current.delete(chapterId)
        const loadedChapter = { id: chapterId, ...sanitized }
        loadedRef.current.set(chapterId, loadedChapter)
        setLoaded(new Map(loadedRef.current))
        setErrors(new Map(errorsRef.current))
        return loadedChapter
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not load this EPUB chapter.'
        errorsRef.current.set(chapterId, message)
        setErrors(new Map(errorsRef.current))
        throw error
      })
      .finally(() => loadingRef.current.delete(chapterId))
    loadingRef.current.set(chapterId, request)
    return request
  }

  useEffect(() => {
    const wanted = getWantedChapters(segments, activeSegment)
    wantedRef.current = new Set(wanted.keys())

    for (const [id, chapter] of loadedRef.current) {
      if (wanted.has(id)) continue
      chapter.objectUrls.forEach((url) => URL.revokeObjectURL(url))
      loadedRef.current.delete(id)
      errorsRef.current.delete(id)
    }
    setLoaded(new Map(loadedRef.current))
    setErrors(new Map(errorsRef.current))

    for (const segment of wanted.values()) {
      void ensureLoaded(segment.id).catch(() => undefined)
    }
  }, [activeSegment, segments])

  useEffect(
    () => () => {
      for (const chapter of loadedRef.current.values()) {
        chapter.objectUrls.forEach((url) => URL.revokeObjectURL(url))
      }
      loadedRef.current.clear()
    },
    [],
  )

  return { loaded, errors, ensureLoaded }
}
