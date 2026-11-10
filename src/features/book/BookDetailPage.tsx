import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  LayoutGrid,
  List,
  Pencil,
} from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button.tsx'
import { IconButton } from '../../components/ui/IconButton.tsx'
import { IconToggle } from '../../components/ui/IconToggle.tsx'
import { Modal } from '../../components/ui/Modal.tsx'
import { ProgressBar } from '../../components/ui/ProgressBar.tsx'
import { Select } from '../../components/ui/Select.tsx'
import { Skeleton } from '../../components/ui/Skeleton.tsx'
import { Tooltip } from '../../components/ui/Tooltip.tsx'
import { useToast } from '../../components/ui/Toast.tsx'
import { db } from '../../data/database.ts'
import { importEpubFile, saveCoverForBooks } from '../../data/libraryRepository.ts'
import type { Book } from '../../data/mockBooks.ts'
import { AddBooksDialog } from '../library/AddBooksDialog.tsx'
import { CoverDialog } from '../library/CoverDialog.tsx'
import { useLibrary } from '../library/useLibrary.ts'
import { useSettings } from '../../lib/theme.tsx'
import type { BookSortMode, SortDirection } from '../../lib/theme.tsx'
import {
  motionDurations,
  motionEasings,
  resolveMotionPreset,
} from '../../lib/motion.ts'

const volumeNumberFormat = new Intl.NumberFormat(undefined, {
  minimumIntegerDigits: 2,
})

const volumeSortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Date Added', value: 'date-added' },
] as const

const volumeLayoutOptions = [
  { label: 'List view', value: 'list', icon: <List size={17} /> },
  { label: 'Grid view', value: 'grid', icon: <LayoutGrid size={17} /> },
] as const

type VolumeLayout = 'list' | 'grid'
type VolumeWithOptionalCover = Book['volumes'][number] & {
  coverUrl?: string | null
}

function createFallbackVolumeCover(title: string) {
  const safeTitle = title.trim() || 'Volume'
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900">
      <rect width="600" height="900" fill="#ffffff"/>
      <path d="M64 100h472" stroke="#111111" stroke-width="2"/>
      <path d="M64 132h124" stroke="#006d5b" stroke-width="8"/>
      <text x="64" y="470" font-family="system-ui, sans-serif" font-size="20" fill="#5c5c5c">LIGHT NOVEL</text>
      <text x="64" y="530" font-family="system-ui, sans-serif" font-size="38" font-weight="500" fill="#111111">${safeTitle.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>
      <path d="M64 820h472" stroke="#111111" stroke-width="2"/>
      <text x="64" y="858" font-family="system-ui, sans-serif" font-size="16" fill="#5c5c5c">LIBER</text>
    </svg>
  `
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function sortVolumes(
  volumes: ReadonlyArray<Book['volumes'][number]>,
  sortMode: BookSortMode,
  direction: SortDirection,
) {
  return [...volumes].sort((first, second) => {
    let comparison = 0

    if (sortMode === 'name') {
      const firstTitle = first.title?.trim() || `Volume ${first.number}`
      const secondTitle = second.title?.trim() || `Volume ${second.number}`
      comparison =
        firstTitle.localeCompare(secondTitle) || first.number - second.number
    } else {
      const firstDate = (
        first as typeof first & { dateAdded?: string | null }
      ).dateAdded
      const secondDate = (
        second as typeof second & { dateAdded?: string | null }
      ).dateAdded

      if (firstDate && secondDate) {
        comparison =
          new Date(firstDate).getTime() - new Date(secondDate).getTime() ||
          first.number - second.number
      } else if (firstDate && !secondDate) {
        comparison = -1
      } else if (!firstDate && secondDate) {
        comparison = 1
      } else {
        comparison = first.number - second.number
      }
    }

    return direction === 'asc' ? comparison : -comparison
  })
}

function getOverallProgress(book: Book) {
  if (book.volumes.length === 0) return 0
  const progressTotal = book.volumes.reduce(
    (total, volume) => total + volume.progress,
    0,
  )
  return Math.round(progressTotal / book.volumes.length)
}

function BookDetailSkeleton() {
  return (
    <div className="book-detail-skeleton" aria-label="Loading book detail">
      <div className="book-detail-skeleton__overview">
        <Skeleton variant="block" className="book-detail-skeleton__cover" />
        <div className="book-detail-skeleton__metadata">
          <Skeleton variant="text" width="78%" height="2rem" />
          <Skeleton variant="text" width="42%" />
          <Skeleton variant="text" width="8rem" height="1.5rem" />
          <Skeleton variant="block" width="100%" height="0.5rem" />
        </div>
      </div>
      <div className="book-detail-skeleton__volumes">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="book-detail-skeleton__row" key={index}>
            <div>
              <Skeleton variant="text" width="5rem" />
              <Skeleton variant="text" width="12rem" />
            </div>
            <Skeleton variant="block" width="7rem" height="3rem" />
          </div>
        ))}
      </div>
    </div>
  )
}

function BookDetails({ book }: { book: Book }) {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const showToast = useToast()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const { settings, updateSettings } = useSettings()
  const storedPreferences = settings.bookDisplayPreferences[book.id] ?? {
    sort: 'name',
    direction: 'asc',
    layout: 'list',
  }
  const [sortMode, setSortMode] = useState<BookSortMode>(storedPreferences.sort)
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    storedPreferences.direction,
  )
  const [displayLayout, setDisplayLayout] = useState<VolumeLayout>(
    storedPreferences.layout,
  )
  const [menuOpen, setMenuOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [coverOpen, setCoverOpen] = useState(false)
  const [addVolumesOpen, setAddVolumesOpen] = useState(false)
  const [editTitle, setEditTitle] = useState(book.title)
  const [editAuthor, setEditAuthor] = useState(book.author)
  const totalVolumes = book.volumes.length
  const overallProgress = getOverallProgress(book)
  const orderedVolumes = sortVolumes(book.volumes, sortMode, sortDirection)
  const displayTitle = book.title?.trim() || 'Untitled book'
  const displayAuthor = book.author?.trim() || 'Unknown author'

  useEffect(() => {
    const nextPreferences = settings.bookDisplayPreferences[book.id] ?? {
      sort: 'name',
      direction: 'asc',
      layout: 'list',
    }
    setSortMode(nextPreferences.sort)
    setSortDirection(nextPreferences.direction)
    setDisplayLayout(nextPreferences.layout)
  }, [book.id, settings.bookDisplayPreferences])

  useEffect(() => {
    setEditTitle(book.title)
    setEditAuthor(book.author)
  }, [book.author, book.id, book.title])

  useEffect(() => {
    if (!menuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const persistBookSort = async (nextSort: BookSortMode) => {
    const currentPreferences = settings.bookDisplayPreferences[book.id] ?? {
      sort: 'name',
      direction: 'asc',
      layout: 'list',
    }
    const nextPreferences = {
      ...currentPreferences,
      sort: nextSort,
    }

    setSortMode(nextSort)
    await updateSettings({
      bookDisplayPreferences: {
        ...settings.bookDisplayPreferences,
        [book.id]: nextPreferences,
      },
    }).catch(() => undefined)
  }

  const persistBookSortDirection = async (nextDirection: SortDirection) => {
    const currentPreferences = settings.bookDisplayPreferences[book.id] ?? {
      sort: 'name',
      direction: 'asc',
      layout: 'list',
    }
    const nextPreferences = {
      ...currentPreferences,
      direction: nextDirection,
    }

    setSortDirection(nextDirection)
    await updateSettings({
      bookDisplayPreferences: {
        ...settings.bookDisplayPreferences,
        [book.id]: nextPreferences,
      },
    }).catch(() => undefined)
  }

  const persistVolumeLayout = async (nextLayout: VolumeLayout) => {
    const currentPreferences = settings.bookDisplayPreferences[book.id] ?? {
      sort: 'name',
      direction: 'asc',
      layout: 'list',
    }
    const nextPreferences = {
      ...currentPreferences,
      layout: nextLayout,
    }

    setDisplayLayout(nextLayout)
    await updateSettings({
      bookDisplayPreferences: {
        ...settings.bookDisplayPreferences,
        [book.id]: nextPreferences,
      },
    }).catch(() => undefined)
  }

  const handleSaveBookDetails = async () => {
    const nextTitle = editTitle.trim() || 'Untitled book'
    const nextAuthor = editAuthor.trim() || 'Unknown author'
    await db.books.update(book.id, {
      title: nextTitle,
      author: nextAuthor,
      dateModified: new Date().toISOString(),
    })
    showToast({ message: 'Book details updated.', variant: 'success' })
    setDetailsOpen(false)
  }

  const handleCoverSave = async (file: File) => {
    await saveCoverForBooks([book.id], file)
    showToast({ message: 'Cover updated.', variant: 'success' })
  }

  const handleAddVolumeImport = async (
    file: File,
    bookFolderName?: string,
    folderCover?: File | null,
  ) =>
    importEpubFile({
      file,
      bookFolderName: bookFolderName ?? book.title,
      bookCover: folderCover ?? null,
      targetBookId: book.id,
    })

  return (
    <>
      <header className="book-detail__overview">
        <div className="book-detail__cover-wrap">
          <img
            className="book-detail__cover"
            src={book.coverUrl}
            alt={`Cover of ${displayTitle}`}
            width="240"
            height="360"
          />
        </div>
        <div className="book-detail__metadata">
          <h1 className="book-detail__title">{displayTitle}</h1>
          <p className="book-detail__author">{displayAuthor}</p>
          {book.sourceTags && book.sourceTags.length > 0 && (
            <p className="book-detail__source-tags">
              {book.sourceTags.join(' · ')}
            </p>
          )}
          <p className="book-detail__volume-count">
            {totalVolumes} {totalVolumes === 1 ? 'volume' : 'volumes'}
          </p>
          <ProgressBar
            value={overallProgress}
            label={`${displayTitle} overall progress`}
            showValue
            className="book-detail__overall-progress"
          />
        </div>
      </header>

      <section
        className="book-detail__volumes"
        aria-labelledby="book-volumes-title"
      >
        <div className="book-detail__list-header">
          <h2 id="book-volumes-title" className="book-detail__section-title">
            Volumes
          </h2>
          <div className="book-detail__sort-controls">
            <Select<BookSortMode>
              label="Sort volumes"
              value={sortMode}
              options={volumeSortOptions}
              onChange={(nextSort) => {
                void persistBookSort(nextSort)
              }}
            />
            <IconToggle<VolumeLayout>
              label="Volume layout"
              value={displayLayout}
              options={volumeLayoutOptions}
              onChange={(nextLayout) => {
                void persistVolumeLayout(nextLayout)
              }}
              className="book-detail__layout-toggle"
            />
            <div className="book-detail__menu-wrap" ref={menuRef}>
              <Tooltip content="Edit book">
                <IconButton
                  label="Edit book"
                  onClick={() => setMenuOpen((current) => !current)}
                >
                  <Pencil size={17} aria-hidden="true" />
                </IconButton>
              </Tooltip>
              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    className="book-detail__menu"
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{
                      duration: reduceMotion ? 0 : motionDurations.base,
                      ease: motionEasings.standard,
                    }}
                  >
                    <button
                      type="button"
                      className="book-detail__menu-item"
                      onClick={() => {
                        setMenuOpen(false)
                        setDetailsOpen(true)
                      }}
                    >
                      Edit details
                    </button>
                    <button
                      type="button"
                      className="book-detail__menu-item"
                      onClick={() => {
                        setMenuOpen(false)
                        setCoverOpen(true)
                      }}
                    >
                      Change cover
                    </button>
                    <button
                      type="button"
                      className="book-detail__menu-item"
                      onClick={() => {
                        setMenuOpen(false)
                        setAddVolumesOpen(true)
                      }}
                    >
                      Add volumes
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <Tooltip
              content={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
            >
              <IconButton
                label={
                  sortDirection === 'asc' ? 'Ascending order' : 'Descending order'
                }
                onClick={() => {
                  const nextDirection =
                    sortDirection === 'asc' ? 'desc' : 'asc'
                  void persistBookSortDirection(nextDirection)
                }}
              >
                <motion.span
                  animate={{ rotate: sortDirection === 'asc' ? 0 : 180 }}
                  transition={{ duration: 0.18, ease: 'easeInOut' }}
                  style={{ display: 'inline-flex' }}
                >
                  {sortDirection === 'asc' ? (
                    <ArrowUp size={17} aria-hidden="true" />
                  ) : (
                    <ArrowDown size={17} aria-hidden="true" />
                  )}
                </motion.span>
              </IconButton>
            </Tooltip>
          </div>
        </div>
        {displayLayout === 'list' ? (
          <motion.ol
            className="book-volume-list"
            layout
            variants={resolveMotionPreset('listContainer', Boolean(reduceMotion)).variants}
            initial={false}
            animate="animate"
            transition={{
              layout: {
                duration: reduceMotion ? 0 : motionDurations.base,
                ease: motionEasings.standard,
              },
            }}
          >
            {orderedVolumes.map((volume) => {
              const destination = `/read/${book.id}/${volume.number}`
              const action = volume.progress > 0 ? 'Continue' : 'Start'

              return (
                <motion.li
                  className="book-volume"
                  key={volume.number}
                  layout
                  variants={resolveMotionPreset('listItem', Boolean(reduceMotion)).variants}
                  transition={{
                    duration: reduceMotion ? 0 : motionDurations.base,
                    ease: motionEasings.standard,
                  }}
                >
                  <Link className="book-volume__details" to={destination}>
                    <span className="book-volume__number">
                      Vol. {volumeNumberFormat.format(volume.number)}
                    </span>
                    <span className="book-volume__title">
                      {volume.title?.trim() || `Volume ${volume.number}`}
                    </span>
                    <span className="book-volume__progress">
                      <ProgressBar
                        value={volume.progress}
                        label={`${volume.title} progress`}
                        showValue
                      />
                    </span>
                  </Link>
                  <Button
                    type="button"
                    variant={volume.progress > 0 ? 'secondary' : 'primary'}
                    size={volume.progress > 0 ? 'normal' : 'large'}
                    className="book-volume__action"
                    onClick={() => navigate(destination)}
                  >
                    {action}
                    <ArrowRight size={17} aria-hidden="true" />
                  </Button>
                </motion.li>
              )
            })}
          </motion.ol>
        ) : (
          <motion.ol
            className="book-volume-grid"
            layout
            variants={resolveMotionPreset('listContainer', Boolean(reduceMotion)).variants}
            initial={false}
            animate="animate"
            transition={{
              layout: {
                duration: reduceMotion ? 0 : motionDurations.base,
                ease: motionEasings.standard,
              },
            }}
          >
            {orderedVolumes.map((volume) => {
              const destination = `/read/${book.id}/${volume.number}`
              const action = volume.progress > 0 ? 'Continue' : 'Start'
              const volumeWithCover = volume as VolumeWithOptionalCover
              const volumeCover =
                volumeWithCover.coverUrl ??
                book.coverUrl ??
                createFallbackVolumeCover(
                  volume.title?.trim() || `Volume ${volume.number}`,
                )

              return (
                <motion.li
                  className="book-volume-card"
                  key={volume.number}
                  layout
                  variants={resolveMotionPreset('listItem', Boolean(reduceMotion)).variants}
                  transition={{
                    duration: reduceMotion ? 0 : motionDurations.base,
                    ease: motionEasings.standard,
                  }}
                >
                  <div className="book-volume-card__content">
                    <Link className="book-volume-card__details" to={destination}>
                      <span className="book-volume-card__cover-wrap">
                        <img
                          className="book-volume-card__cover"
                          src={volumeCover}
                          alt={`Cover for ${volume.title || `Volume ${volume.number}`}`}
                          width="240"
                          height="360"
                        />
                      </span>
                      <span className="book-volume-card__meta">
                        <span className="book-volume-card__number">
                          Vol. {volumeNumberFormat.format(volume.number)}
                        </span>
                        <span className="book-volume-card__title">
                          {volume.title?.trim() || `Volume ${volume.number}`}
                        </span>
                      </span>
                      <span className="book-volume-card__progress">
                        <ProgressBar
                          value={volume.progress}
                          label={`${volume.title} progress`}
                          showValue
                        />
                      </span>
                    </Link>
                    <Button
                      type="button"
                      variant={volume.progress > 0 ? 'secondary' : 'primary'}
                      size={volume.progress > 0 ? 'normal' : 'large'}
                      className="book-volume-card__action"
                      onClick={() => navigate(destination)}
                    >
                      {action}
                      <ArrowRight size={17} aria-hidden="true" />
                    </Button>
                  </div>
                </motion.li>
              )
            })}
          </motion.ol>
        )}
      </section>

      <Modal open={detailsOpen} title="Edit details" onOpenChange={setDetailsOpen}>
        <div className="book-detail__editor">
          <label className="book-detail__field">
            <span>Title</span>
            <input
              type="text"
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
            />
          </label>
          <label className="book-detail__field">
            <span>Author</span>
            <input
              type="text"
              value={editAuthor}
              onChange={(event) => setEditAuthor(event.target.value)}
            />
          </label>
          <div className="book-detail__editor-actions">
            <Button type="button" variant="secondary" onClick={() => setDetailsOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={() => void handleSaveBookDetails()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <CoverDialog
        open={coverOpen}
        selectedCount={1}
        onOpenChange={setCoverOpen}
        onConfirm={(file) => handleCoverSave(file)}
      />

      <AddBooksDialog
        open={addVolumesOpen}
        onOpenChange={setAddVolumesOpen}
        onImport={handleAddVolumeImport}
        onImportComplete={(message, variant) =>
          showToast({ message, variant: variant ?? 'success' })
        }
      />
    </>
  )
}

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const library = useLibrary()
  const [resolvedId, setResolvedId] = useState<string | null>(null)
  const book = library.find((candidate) => candidate.id === id)

  useEffect(() => {
    if (!id) return

    const timeout = window.setTimeout(() => setResolvedId(id), 180)
    return () => window.clearTimeout(timeout)
  }, [id])

  const isLoading = resolvedId !== id

  return (
    <main className="book-detail">
      <Button
        type="button"
        variant="ghost"
        className="book-detail__back"
        onClick={() => navigate('/')}
      >
        <ArrowLeft size={17} aria-hidden="true" />
        Back to Library
      </Button>

      {isLoading ? (
        <BookDetailSkeleton />
      ) : book ? (
        <BookDetails book={book} />
      ) : (
        <section className="book-detail__not-found">
          <h1 className="book-detail__title">Book not found</h1>
          <p className="book-detail__author">
            This book is not in your library.
          </p>
        </section>
      )}
    </main>
  )
}
