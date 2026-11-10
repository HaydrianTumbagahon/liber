import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, TouchEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../../components/ui/Button.tsx'
import type { ReaderMode } from './ReaderTopBar.tsx'
import type { LoadedReaderChapter } from './useReaderChapterContent.ts'
import type { ReaderSegment } from './readerSegments.ts'

function getPageStride(prose: HTMLElement) {
  const styles = getComputedStyle(prose)
  const gap = Number.parseFloat(styles.columnGap) || 0
  const columnWidth = Number.parseFloat(styles.columnWidth) || 0
  const width =
    prose.clientWidth || prose.parentElement?.clientWidth || columnWidth
  return width + gap
}

function ChapterContent({
  segment,
  loaded,
  error,
  segmentIndex,
  onSentenceSelect,
}: {
  segment: Extract<ReaderSegment, { kind: 'chapter' }>
  loaded: LoadedReaderChapter | undefined
  error: string | undefined
  segmentIndex: number
  onSentenceSelect: (
    chapterId: string,
    sentenceIndex: number,
    segmentIndex: number,
  ) => void
}) {
  const { volumeNumber, id } = segment
  const handleClick = (event: MouseEvent<HTMLElement>) => {
    if (!(event.target instanceof Element)) return
    const sentence = event.target.closest<HTMLElement>(
      '[data-tts-sentence-index]',
    )
    if (!sentence) return
    const sentenceIndex = Number(sentence.dataset.ttsSentenceIndex)
    if (Number.isInteger(sentenceIndex)) {
      onSentenceSelect(id, sentenceIndex, segmentIndex)
    }
  }

  return (
    <article
      className={`reader-chapter${loaded ? '' : ' reader-chapter--loading'}`}
      id={id}
      data-reader-segment="true"
      data-reader-segment-index={segmentIndex}
      data-volume-id={segment.volumeId}
      aria-busy={!loaded && !error}
      onClick={handleClick}
    >
      <p className="reader-chapter__eyebrow">
        Volume {volumeNumber} / Chapter {segment.chapterIndex + 1}
      </p>
      <h2 className="reader-chapter__title">{segment.title}</h2>
      {error ? (
        <p className="reader-chapter__error" role="alert">
          {error}
        </p>
      ) : loaded ? (
        <div
          className="reader-prose"
          dangerouslySetInnerHTML={{ __html: loaded.html }}
        />
      ) : (
        <div
          className="reader-chapter__placeholder"
          aria-label="Loading chapter"
        >
          <span />
          <span />
          <span />
        </div>
      )}
    </article>
  )
}

function VolumeBoundary({
  segment,
  segmentIndex,
  preview,
}: {
  segment: Extract<ReaderSegment, { kind: 'volume-end' }>
  segmentIndex: number
  preview: LoadedReaderChapter | undefined
}) {
  return (
    <section
      className="reader-volume-boundary"
      id={segment.id}
      data-reader-segment="true"
      data-reader-segment-index={segmentIndex}
      data-volume-id={segment.volumeId}
    >
      <div className="reader-volume-boundary__rule">
        <span>End of Volume {segment.volumeNumber}</span>
      </div>
      {segment.nextVolumeTitle && (
        <aside className="reader-volume-preview">
          <p className="reader-volume-preview__label">Next volume</p>
          <h2 className="reader-volume-preview__title">
            {segment.nextVolumeTitle}
          </h2>
          {preview ? (
            <p className="reader-volume-preview__text">
              {preview.plainText.slice(0, 240)}
              {preview.plainText.length > 240 ? '...' : ''}
            </p>
          ) : (
            <p className="reader-volume-preview__text">Loading preview...</p>
          )}
        </aside>
      )}
    </section>
  )
}

function SegmentContent({
  segment,
  segmentIndex,
  loadedChapters,
  chapterErrors,
  onSentenceSelect,
}: {
  segment: ReaderSegment
  segmentIndex: number
  loadedChapters: ReadonlyMap<string, LoadedReaderChapter>
  chapterErrors: ReadonlyMap<string, string>
  onSentenceSelect: (
    chapterId: string,
    sentenceIndex: number,
    segmentIndex: number,
  ) => void
}) {
  return segment.kind === 'chapter' ? (
    <ChapterContent
      segment={segment}
      segmentIndex={segmentIndex}
      loaded={loadedChapters.get(segment.id)}
      error={chapterErrors.get(segment.id)}
      onSentenceSelect={onSentenceSelect}
    />
  ) : (
    <VolumeBoundary
      segment={segment}
      segmentIndex={segmentIndex}
      preview={
        segment.nextPreviewId
          ? loadedChapters.get(segment.nextPreviewId)
          : undefined
      }
    />
  )
}

type ReaderContentProps = {
  mode: ReaderMode
  segments: readonly ReaderSegment[]
  activeSegment: number
  onActiveSegmentChange: (segment: number) => void
  loadedChapters: ReadonlyMap<string, LoadedReaderChapter>
  chapterErrors: ReadonlyMap<string, string>
  fontSize: number
  lineHeight: number
  margins: number
  restorePageIndex: number | null
  onPageStateChange: (pageIndex: number, pageCount: number) => void
  onPageRestoreComplete: () => void
  onSentenceSelect: (
    chapterId: string,
    sentenceIndex: number,
    segmentIndex: number,
  ) => void
}

export function ReaderContent({
  mode,
  segments,
  activeSegment,
  onActiveSegmentChange,
  loadedChapters,
  chapterErrors,
  fontSize,
  lineHeight,
  margins,
  restorePageIndex,
  onPageStateChange,
  onPageRestoreComplete,
  onSentenceSelect,
}: ReaderContentProps) {
  const contentRef = useRef<HTMLElement>(null)
  const paginatedContentRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(1)
  const paginated = mode !== 'continuous'
  const isRtl = mode === 'paginated-rtl'
  const clampSegment = (next: number) =>
    onActiveSegmentChange(Math.min(segments.length - 1, Math.max(0, next)))
  const movePage = (direction: -1 | 1) => {
    const prose =
      paginatedContentRef.current?.querySelector<HTMLElement>('.reader-prose')
    if (prose) {
      const stride = getPageStride(prose)
      const nextPage = pageIndex + direction
      if (nextPage >= 0 && nextPage < pageCount) {
        prose.scrollTo({
          left: (isRtl ? -1 : 1) * nextPage * stride,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
            .matches
            ? 'auto'
            : 'smooth',
        })
        setPageIndex(nextPage)
        onPageStateChange(nextPage, pageCount)
        return
      }
    }
    clampSegment(activeSegment + direction)
  }
  const changeFromSide = (side: 'left' | 'right') => {
    const forward = isRtl ? side === 'left' : side === 'right'
    movePage(forward ? 1 : -1)
  }

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null
  }

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return
    const delta =
      (event.changedTouches[0]?.clientX ?? touchStartX.current) -
      touchStartX.current
    touchStartX.current = null
    if (Math.abs(delta) < 52) return
    const forward = isRtl ? delta > 0 : delta < 0
    movePage(forward ? 1 : -1)
  }

  const style = {
    '--reader-font-size': `${fontSize}rem`,
    '--reader-line-height': lineHeight,
    '--reader-margin': `${margins}rem`,
  } as CSSProperties

  useEffect(() => {
    if (paginated || !contentRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        const nearest = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (first, second) =>
              Math.abs(first.boundingClientRect.top - 150) -
              Math.abs(second.boundingClientRect.top - 150),
          )[0]
        const nextIndex = Number(
          (nearest?.target as HTMLElement | undefined)?.dataset
            .readerSegmentIndex,
        )
        if (Number.isInteger(nextIndex)) onActiveSegmentChange(nextIndex)
      },
      { rootMargin: '-15% 0px -65% 0px', threshold: [0, 0.1] },
    )

    contentRef.current
      .querySelectorAll<HTMLElement>('[data-reader-segment="true"]')
      .forEach((segment) => observer.observe(segment))
    return () => observer.disconnect()
  }, [onActiveSegmentChange, paginated, segments])

  useEffect(() => {
    setPageIndex(0)
    setPageCount(1)
    if (!paginated || !paginatedContentRef.current) return
    const prose =
      paginatedContentRef.current.querySelector<HTMLElement>('.reader-prose')
    if (!prose) return

    const measurePages = () => {
      const stride = getPageStride(prose)
      if (stride <= 0) return
      const count = Math.max(1, Math.ceil(prose.scrollWidth / stride))
      setPageCount(count)
      const currentPage = Math.round(Math.abs(prose.scrollLeft) / stride)
      setPageIndex(Math.min(count - 1, currentPage))
      onPageStateChange(Math.min(count - 1, currentPage), count)
      if (restorePageIndex !== null) {
        const restoredPage = Math.min(count - 1, restorePageIndex)
        prose.scrollTo({
          left: (isRtl ? -1 : 1) * restoredPage * stride,
          behavior: 'auto',
        })
        setPageIndex(restoredPage)
        onPageStateChange(restoredPage, count)
        onPageRestoreComplete()
      }
    }

    const frame = window.requestAnimationFrame(measurePages)
    const observer = new ResizeObserver(measurePages)
    observer.observe(prose)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [
    activeSegment,
    isRtl,
    loadedChapters,
    mode,
    onPageRestoreComplete,
    onPageStateChange,
    paginated,
    restorePageIndex,
  ])

  const canTurn = (side: 'left' | 'right') => {
    const forward = isRtl ? side === 'left' : side === 'right'
    const direction = forward ? 1 : -1
    return direction > 0
      ? pageIndex < pageCount - 1 || activeSegment < segments.length - 1
      : pageIndex > 0 || activeSegment > 0
  }

  if (!paginated) {
    return (
      <main
        ref={contentRef}
        className="reader-content reader-content--continuous"
        data-lenis-prevent
        style={style}
      >
        {segments.map((segment, index) => (
          <SegmentContent
            segment={segment}
            segmentIndex={index}
            loadedChapters={loadedChapters}
            chapterErrors={chapterErrors}
            onSentenceSelect={onSentenceSelect}
            key={segment.id}
          />
        ))}
      </main>
    )
  }

  const segment = segments[activeSegment]

  return (
    <main
      className={`reader-content reader-content--paginated${isRtl ? ' reader-content--rtl' : ' reader-content--ltr'}`}
      data-lenis-prevent
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') changeFromSide(isRtl ? 'right' : 'left')
        if (event.key === 'ArrowRight') changeFromSide(isRtl ? 'left' : 'right')
      }}
      tabIndex={0}
      style={style}
      aria-label={
        isRtl
          ? 'Right-to-left paginated reading'
          : 'Left-to-right paginated reading'
      }
    >
      <Button
        type="button"
        variant="ghost"
        className="reader-turn-zone reader-turn-zone--left"
        aria-label={isRtl ? 'Next page' : 'Previous page'}
        disabled={!canTurn('left')}
        onClick={() => changeFromSide('left')}
      >
        <ChevronLeft size={22} aria-hidden="true" />
      </Button>
      <div ref={paginatedContentRef} className="reader-page-viewport">
        {segment && (
          <SegmentContent
            segment={segment}
            segmentIndex={activeSegment}
            loadedChapters={loadedChapters}
            chapterErrors={chapterErrors}
            onSentenceSelect={onSentenceSelect}
          />
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        className="reader-turn-zone reader-turn-zone--right"
        aria-label={isRtl ? 'Previous page' : 'Next page'}
        disabled={!canTurn('right')}
        onClick={() => changeFromSide('right')}
      >
        <ChevronRight size={22} aria-hidden="true" />
      </Button>
      <span className="reader-page-count" aria-live="polite">
        {pageIndex + 1} / {pageCount} · {activeSegment + 1} / {segments.length}
      </span>
    </main>
  )
}
