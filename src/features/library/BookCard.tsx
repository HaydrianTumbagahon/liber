import { useEffect, useRef } from 'react'
import type { MouseEvent, PointerEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '../../components/ui/Badge.tsx'
import { ProgressBar } from '../../components/ui/ProgressBar.tsx'
import type { Book } from '../../data/mockBooks.ts'

type BookCardProps = {
  book: Book
  view: 'grid' | 'list'
  selected: boolean
  selectionMode: boolean
  coverUrl?: string
  onSelect: () => void
}

function fallbackText(value: string | null | undefined, fallback: string) {
  return value && value.trim() ? value.trim() : fallback
}

const dateAddedFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
})

const lastReadFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const statusLabels = {
  unread: 'Unread',
  'in-progress': 'In Progress',
  completed: 'Completed',
} as const

function getProgress(book: Book) {
  if (book.volumes.length === 0) return 0
  const total = book.volumes.reduce((sum, volume) => sum + volume.progress, 0)
  return Math.round(total / book.volumes.length)
}

function BookListCell({
  area,
  label,
  children,
}: {
  area: 'volumes' | 'added' | 'progress' | 'lastread'
  label: string
  children: React.ReactNode
}) {
  return (
    <div className={`book-card__list-cell book-card__list-cell--${area}`}>
      <span className="book-card__list-label">{label}</span>
      {children}
    </div>
  )
}

export function BookCard({
  book,
  view,
  selected,
  selectionMode,
  coverUrl,
  onSelect,
}: BookCardProps) {
  const reduceMotion = useReducedMotion()
  const longPressTimer = useRef<number | null>(null)
  const clickResetTimer = useRef<number | null>(null)
  const longPressActivated = useRef(false)
  const volumeLabel = `${book.volumes.length} ${book.volumes.length === 1 ? 'volume' : 'volumes'}`
  const progress = getProgress(book)
  const bookTitle = fallbackText(book.title, 'Untitled book')
  const bookAuthor = fallbackText(book.author, 'Unknown author')

  const clearLongPressTimer = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  useEffect(
    () => () => {
      clearLongPressTimer()
      if (clickResetTimer.current !== null) {
        window.clearTimeout(clickResetTimer.current)
      }
    },
    [],
  )

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') return
    longPressActivated.current = false
    clearLongPressTimer()
    longPressTimer.current = window.setTimeout(() => {
      longPressActivated.current = true
      onSelect()
      clickResetTimer.current = window.setTimeout(() => {
        longPressActivated.current = false
      }, 900)
    }, 520)
  }

  const handleClickCapture = (event: MouseEvent<HTMLElement>) => {
    if (longPressActivated.current) {
      event.preventDefault()
      event.stopPropagation()
      longPressActivated.current = false
      if (clickResetTimer.current !== null) {
        window.clearTimeout(clickResetTimer.current)
        clickResetTimer.current = null
      }
      return
    }

    if (selectionMode) {
      event.preventDefault()
      event.stopPropagation()
      onSelect()
    }
  }

  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    if (!longPressActivated.current) onSelect()
  }

  return (
    <motion.article
      className={`book-card book-card--${view}${selected ? ' is-selected' : ''}`}
      animate={{ scale: selected ? 1.02 : 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.14 }}
      onPointerDown={handlePointerDown}
      onPointerUp={clearLongPressTimer}
      onPointerCancel={clearLongPressTimer}
      onPointerLeave={clearLongPressTimer}
      onContextMenu={handleContextMenu}
      onClickCapture={handleClickCapture}
    >
      <Link to={`/book/${book.id}`} className="book-card__link">
        <span className="book-card__cover-wrap">
          <img
            className="book-card__cover"
            src={coverUrl ?? book.coverUrl}
            alt=""
            draggable={false}
          />
          {book.missingFile && (
            <span
              className="book-card__missing"
              role="img"
              aria-label="Book file missing"
            >
              <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
            </span>
          )}
          <motion.span
            className="book-card__selected-mark"
            initial={false}
            animate={{ opacity: selected ? 1 : 0, scale: selected ? 1 : 0.7 }}
            transition={{ duration: reduceMotion ? 0 : 0.12 }}
            aria-hidden="true"
          >
            <Check size={17} strokeWidth={2.2} />
          </motion.span>
        </span>

        <span className="book-card__identity">
          <span className="book-card__title">{bookTitle}</span>
          <span className="book-card__author">{bookAuthor}</span>
          {view === 'grid' && <Badge>{volumeLabel}</Badge>}
        </span>

        {view === 'list' && (
          <>
            <BookListCell area="volumes" label="Volumes">
              <Badge>{volumeLabel}</Badge>
            </BookListCell>
            <BookListCell area="added" label="Date added">
              <time className="book-card__timestamp" dateTime={book.dateAdded}>
                {dateAddedFormat.format(new Date(book.dateAdded))}
              </time>
            </BookListCell>
            <BookListCell area="progress" label="Progress">
              <span className="book-card__status">
                {statusLabels[book.status]}
              </span>
              <ProgressBar value={progress} label={`${bookTitle} progress`} />
            </BookListCell>
            <BookListCell area="lastread" label="Last read">
              {book.lastRead ? (
                <time className="book-card__timestamp" dateTime={book.lastRead}>
                  {lastReadFormat.format(new Date(book.lastRead))}
                </time>
              ) : (
                <span className="book-card__timestamp">Never</span>
              )}
            </BookListCell>
          </>
        )}
      </Link>
    </motion.article>
  )
}
