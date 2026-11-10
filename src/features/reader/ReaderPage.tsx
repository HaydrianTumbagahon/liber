import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button.tsx'
import { saveProgress } from '../../data/libraryRepository.ts'
import { useSettings } from '../../lib/theme.tsx'
import { ChapterSheet } from './ChapterSheet.tsx'
import type { ChapterJumpItem } from './ChapterSheet.tsx'
import { ReaderContent } from './ReaderContent.tsx'
import { ReaderControls } from './ReaderControls.tsx'
import { ReaderTopBar } from './ReaderTopBar.tsx'
import { ReaderTextSettingsDialog } from './ReaderTextSettingsDialog.tsx'
import { buildReaderSegments } from './readerSegments.ts'
import { useReaderBook } from './useReaderBook.ts'
import { useReaderChapterContent } from './useReaderChapterContent.ts'
import { useReaderTts } from './useReaderTts.ts'

export function ReaderPage() {
  const { bookId, volumeNumber } = useParams<{
    bookId: string
    volumeNumber: string
  }>()
  const navigate = useNavigate()
  const { settings, updateSettings } = useSettings()
  const snapshot = useReaderBook(bookId)
  const startVolumeNumber = Number(volumeNumber)
  const selectedVolume = snapshot?.volumes.find(
    ({ volume }) => volume.number === startVolumeNumber,
  )
  const segments = useMemo(
    () =>
      snapshot && Number.isFinite(startVolumeNumber)
        ? buildReaderSegments(snapshot, startVolumeNumber)
        : [],
    [snapshot, startVolumeNumber],
  )
  const mode = settings.readingMode
  const [activeSegment, setActiveSegment] = useState(0)
  const [topBarVisible, setTopBarVisible] = useState(true)
  const [chapterSheetOpen, setChapterSheetOpen] = useState(false)
  const [textSettingsOpen, setTextSettingsOpen] = useState(false)
  const [restorePageIndex, setRestorePageIndex] = useState<number | null>(null)
  const progressRef = useRef<HTMLProgressElement | null>(null)
  const previousScrollY = useRef(0)
  const activeSegmentRef = useRef(0)
  const pageIndexRef = useRef(0)
  const pageCountRef = useRef(1)
  const segmentsRef = useRef(segments)
  const snapshotRef = useRef(snapshot)
  const modeRef = useRef(mode)
  const saveTimer = useRef<number | null>(null)
  const scheduleSaveRef = useRef<() => void>(() => undefined)
  const restoredRouteRef = useRef<string | null>(null)
  const restoreTargetRef = useRef<{
    routeKey: string
    segmentId: string
    scrollOffset: number
  } | null>(null)
  const routeKey = `${bookId ?? ''}:${volumeNumber ?? ''}`
  const { loaded, errors, ensureLoaded } = useReaderChapterContent(
    segments,
    activeSegment,
  )
  const tts = useReaderTts({
    bookId: bookId ?? '',
    bookTitle: snapshot?.book.title ?? '',
    snapshot,
    segments,
    activeSegment,
    onActiveSegmentChange: setActiveSegment,
    loadedChapters: loaded,
    ensureChapterLoaded: ensureLoaded,
    speed: settings.defaultSpeed,
    preferredVoice: settings.preferredVoice,
  })

  segmentsRef.current = segments
  snapshotRef.current = snapshot
  modeRef.current = mode

  const chapterItems = useMemo<ChapterJumpItem[]>(
    () =>
      segments.flatMap((segment, segmentIndex) =>
        segment.kind === 'chapter'
          ? [
              {
                id: segment.id,
                title: segment.title,
                volumeNumber: segment.volumeNumber,
                segmentIndex,
              },
            ]
          : [],
      ),
    [segments],
  )

  const scheduleProgressSave = () => {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      const currentSegments = segmentsRef.current
      const active = currentSegments[activeSegmentRef.current]
      if (!active) return
      const currentChapter =
        active.kind === 'chapter'
          ? active
          : [...currentSegments]
              .slice(0, activeSegmentRef.current)
              .reverse()
              .find(
                (segment) =>
                  segment.kind === 'chapter' &&
                  segment.volumeId === active.volumeId,
              )
      if (!currentChapter || currentChapter.kind !== 'chapter') return

      const readerSnapshot = snapshotRef.current
      const volumeSnapshot = readerSnapshot?.volumes.find(
        ({ volume }) => volume.id === currentChapter.volumeId,
      )
      if (!readerSnapshot || !volumeSnapshot) return

      const volumeChapters = currentSegments.filter(
        (segment) =>
          segment.kind === 'chapter' &&
          segment.volumeId === currentChapter.volumeId,
      )
      const chapterIndex = currentChapter.chapterIndex
      let scrollOffset = 0
      let percent =
        active.kind === 'volume-end'
          ? 100
          : Math.round(
              ((chapterIndex +
                (pageIndexRef.current + 1) / pageCountRef.current) /
                volumeChapters.length) *
                100,
            )

      if (modeRef.current === 'continuous') {
        const chapterElement = document.getElementById(currentChapter.id)
        if (chapterElement) {
          const chapterTop =
            chapterElement.getBoundingClientRect().top + window.scrollY
          const chapterHeight = chapterElement.getBoundingClientRect().height
          scrollOffset = Math.max(0, window.scrollY - chapterTop)
          const withinChapter =
            chapterHeight > 0
              ? Math.min(1, Math.max(0, scrollOffset / chapterHeight))
              : 0
          percent = Math.round(
            ((chapterIndex + withinChapter) / volumeChapters.length) * 100,
          )
        }
        if (active.kind === 'volume-end') percent = 100
      }

      void saveProgress(
        volumeSnapshot.volume.stableKey,
        volumeSnapshot.volume.id,
        readerSnapshot.book.id,
        { chapterIndex, scrollOffset, pageIndex: pageIndexRef.current },
        percent,
      )
    }, 550)
  }
  scheduleSaveRef.current = scheduleProgressSave

  useEffect(() => {
    activeSegmentRef.current = activeSegment
  }, [activeSegment])

  useEffect(() => {
    restoredRouteRef.current = null
    restoreTargetRef.current = null
    activeSegmentRef.current = 0
    pageIndexRef.current = 0
    pageCountRef.current = 1
    setRestorePageIndex(null)
    setActiveSegment(0)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [routeKey])

  useEffect(() => {
    if (
      !snapshot ||
      !selectedVolume ||
      segments.length === 0 ||
      restoredRouteRef.current === routeKey
    ) {
      return
    }

    const savedPosition = selectedVolume.progress?.position
    const savedChapterIndex = savedPosition?.chapterIndex ?? 0
    const targetIndex = segments.findIndex(
      (segment) =>
        segment.kind === 'chapter' &&
        segment.volumeId === selectedVolume.volume.id &&
        segment.chapterIndex === savedChapterIndex,
    )
    const nextIndex = targetIndex >= 0 ? targetIndex : 0
    const target = segments[nextIndex]
    if (!target) return

    restoredRouteRef.current = routeKey
    restoreTargetRef.current = {
      routeKey,
      segmentId: target.id,
      scrollOffset: savedPosition?.scrollOffset ?? 0,
    }
    setRestorePageIndex(savedPosition?.pageIndex ?? 0)
    activeSegmentRef.current = nextIndex
    setActiveSegment(nextIndex)
  }, [routeKey, segments, selectedVolume, snapshot])

  useEffect(() => {
    const restoreTarget = restoreTargetRef.current
    if (
      mode !== 'continuous' ||
      !restoreTarget ||
      restoreTarget.routeKey !== routeKey ||
      !loaded.has(restoreTarget.segmentId)
    ) {
      return
    }

    const targetSegment = segments.find(
      (segment) => segment.id === restoreTarget.segmentId,
    )
    if (!targetSegment || targetSegment.kind !== 'chapter') return
    const targetElement = document.getElementById(targetSegment.id)
    if (!targetElement) return

    const chapterTop =
      targetElement.getBoundingClientRect().top + window.scrollY
    window.scrollTo({
      top: chapterTop + restoreTarget.scrollOffset,
      behavior: 'auto',
    })
    restoreTargetRef.current = null
  }, [loaded, mode, routeKey, segments])

  useEffect(() => {
    previousScrollY.current = window.scrollY
    const updateChromeAndSave = () => {
      const currentY = window.scrollY
      const difference = currentY - previousScrollY.current
      if (!settings.autoHideTopBar || currentY < 48 || difference < -4) {
        setTopBarVisible(true)
      } else if (difference > 4) {
        setTopBarVisible(false)
      }
      previousScrollY.current = currentY
      if (mode === 'continuous') scheduleSaveRef.current()
    }

    window.addEventListener('scroll', updateChromeAndSave, { passive: true })
    return () => {
      window.removeEventListener('scroll', updateChromeAndSave)
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    }
  }, [mode, settings.autoHideTopBar])

  useEffect(() => {
    if (!progressRef.current) return
    progressRef.current.value = segments.length
      ? ((activeSegment + 1) / segments.length) * 100
      : 0
  }, [activeSegment, segments.length])

  useEffect(() => {
    if (mode === 'paginated-ltr' || mode === 'paginated-rtl') {
      scheduleSaveRef.current()
    }
  }, [activeSegment, mode])

  const handleActiveSegmentChange = (nextSegment: number) => {
    activeSegmentRef.current = nextSegment
    setActiveSegment(nextSegment)
    if (mode !== 'continuous') scheduleSaveRef.current()
  }

  const handlePageStateChange = (pageIndex: number, pageCount: number) => {
    pageIndexRef.current = pageIndex
    pageCountRef.current = pageCount
    if (mode !== 'continuous') scheduleSaveRef.current()
  }

  if (snapshot === null) {
    return (
      <main className="reader-invalid" aria-busy="true">
        <p>Loading EPUB...</p>
      </main>
    )
  }

  if (!snapshot || !selectedVolume) {
    return (
      <main className="reader-invalid">
        <h1 className="reader-invalid__title">Book or volume not found</h1>
        <Button type="button" variant="secondary" onClick={() => navigate('/')}>
          Back to Library
        </Button>
      </main>
    )
  }

  const activeSection = segments[activeSegment]
  const activeChapterId =
    activeSection?.kind === 'chapter' ? activeSection.id : null
  const displayedVolumeTitle =
    activeSection?.volumeTitle ?? selectedVolume.volume.title
  const hasChapters = segments.some((segment) => segment.kind === 'chapter')

  if (!hasChapters) {
    return (
      <main className="reader-invalid">
        <h1 className="reader-invalid__title">
          {selectedVolume.volume.fileMissing
            ? 'EPUB file missing'
            : 'No readable chapters found'}
        </h1>
        <p className="reader-invalid__message">
          {selectedVolume.volume.fileMissing
            ? 'Re-add this EPUB to restore its reading content. Saved progress is preserved.'
            : 'This volume has no saved spine entries to read.'}
        </p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => navigate(`/book/${snapshot.book.id}`)}
        >
          Back to book
        </Button>
      </main>
    )
  }

  const selectChapter = (chapter: ChapterJumpItem) => {
    tts.onChapterJump(chapter.id, chapter.segmentIndex)
    if (mode === 'continuous') {
      document.getElementById(chapter.id)?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      })
    } else {
      handleActiveSegmentChange(chapter.segmentIndex)
    }
    setChapterSheetOpen(false)
  }

  return (
    <main className="reader-shell">
      <ReaderTopBar
        bookTitle={snapshot.book.title}
        volumeTitle={displayedVolumeTitle}
        visible={topBarVisible}
        mode={mode}
        onModeChange={(nextMode) => {
          if (nextMode === 'continuous' && activeSection?.kind === 'chapter') {
            window.requestAnimationFrame(() => {
              document.getElementById(activeSection.id)?.scrollIntoView({
                block: 'start',
                behavior: 'auto',
              })
            })
          }
          void updateSettings({ readingMode: nextMode })
          setTopBarVisible(true)
        }}
        onBack={() => navigate(`/book/${snapshot.book.id}`)}
        progressRef={progressRef}
      />
      <ReaderContent
        mode={mode}
        segments={segments}
        activeSegment={activeSegment}
        onActiveSegmentChange={handleActiveSegmentChange}
        loadedChapters={loaded}
        chapterErrors={errors}
        fontSize={settings.readerFontSize}
        lineHeight={settings.readerLineHeight}
        margins={settings.readerMargins}
        restorePageIndex={restorePageIndex}
        onPageStateChange={handlePageStateChange}
        onPageRestoreComplete={() => setRestorePageIndex(null)}
        onSentenceSelect={tts.onSentenceSelect}
      />
      <ReaderControls
        ttsState={tts.state}
        speed={settings.defaultSpeed}
        voice={settings.preferredVoice}
        voices={tts.voices}
        speechSupported={tts.supported}
        notice={tts.notice}
        continueActive={tts.hasContinuePosition}
        onPlayPause={tts.onPlayPause}
        onSpeedChange={(defaultSpeed) => updateSettings({ defaultSpeed })}
        onVoiceChange={(preferredVoice) => updateSettings({ preferredVoice })}
        onContinue={tts.onContinue}
        onOpenChapters={() => setChapterSheetOpen(true)}
        onOpenTextSettings={() => setTextSettingsOpen(true)}
      />
      <ReaderTextSettingsDialog
        open={textSettingsOpen}
        onOpenChange={setTextSettingsOpen}
      />
      <ChapterSheet
        open={chapterSheetOpen}
        chapters={chapterItems}
        activeChapterId={activeChapterId}
        onOpenChange={setChapterSheetOpen}
        onSelect={selectChapter}
      />
    </main>
  )
}
