import { useEffect, useMemo, useRef, useState } from 'react'
import type { TouchEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { BookPlus, ImagePlus, Layers, RefreshCw, Trash2, X } from 'lucide-react'
import { Badge } from '../../components/ui/Badge.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { SegmentedControl } from '../../components/ui/SegmentedControl.tsx'
import { Skeleton } from '../../components/ui/Skeleton.tsx'
import { Toast } from '../../components/ui/Toast.tsx'
import { useSettings } from '../../lib/theme.tsx'
import type { LibraryLayout, LibrarySort } from '../../lib/theme.tsx'
import { useLibrary } from './useLibrary.ts'
import type { Book, BookStatus } from '../../data/mockBooks.ts'
import { AddBooksDialog } from './AddBooksDialog.tsx'
import { BookCard } from './BookCard.tsx'
import { CoverDialog } from './CoverDialog.tsx'
import { DeleteBooksDialog } from './DeleteBooksDialog.tsx'
import { EmptyLibraryState } from './EmptyLibraryState.tsx'
import { GroupBooksDialog } from './GroupBooksDialog.tsx'
import {
  deleteBooks as deleteBooksFromStorage,
  groupBooksIntoSeries,
  importEpubDirectory,
  importEpubFile,
  resyncLibrary,
  saveCoverForBooks,
} from '../../data/libraryRepository.ts'

type ViewMode = LibraryLayout
type SortMode = LibrarySort

const viewOptions = [
  { label: 'Grid', value: 'grid' },
  { label: 'List', value: 'list' },
] as const

const sortOptions: { label: string; value: SortMode }[] = [
  { label: 'Date Added', value: 'date-added' },
  { label: 'Date Modified', value: 'date-modified' },
  { label: 'Last Read', value: 'last-read' },
  { label: 'Completed', value: 'completed' },
  { label: 'Title', value: 'title' },
  { label: 'Author', value: 'author' },
]

const completionOrder: Record<BookStatus, number> = {
  completed: 0,
  'in-progress': 1,
  unread: 2,
}

function compareDatesDescending(first: string | null, second: string | null) {
  if (first === null) return second === null ? 0 : 1
  if (second === null) return -1
  return new Date(second).getTime() - new Date(first).getTime()
}

function sortBooks(books: readonly Book[], sortMode: SortMode) {
  return [...books].sort((first, second) => {
    switch (sortMode) {
      case 'date-added':
        return compareDatesDescending(first.dateAdded, second.dateAdded)
      case 'date-modified':
        return compareDatesDescending(first.dateModified, second.dateModified)
      case 'last-read':
        return compareDatesDescending(first.lastRead, second.lastRead)
      case 'completed':
        return (
          completionOrder[first.status] - completionOrder[second.status] ||
          compareDatesDescending(first.lastRead, second.lastRead)
        )
      case 'title':
        return first.title.localeCompare(second.title)
      case 'author':
        return first.author.localeCompare(second.author)
    }
  })
}

function LibrarySkeleton({ view }: { view: ViewMode }) {
  return (
    <div
      className={`library-skeletons library-skeletons--${view}`}
      aria-label="Loading library"
    >
      {Array.from({ length: 10 }, (_, index) => (
        <div className="library-skeleton" key={index}>
          <Skeleton variant="block" className="library-skeleton__cover" />
          <div className="library-skeleton__lines">
            <Skeleton variant="text" width="82%" />
            <Skeleton variant="text" width="55%" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function LibraryPage() {
  const library = useLibrary()
  const { settings, updateSettings } = useSettings()
  const [searchParams] = useSearchParams()
  const reduceMotion = useReducedMotion()
  const [view, setView] = useState<ViewMode>(() => settings.libraryLayout)
  const [sortMode, setSortMode] = useState<SortMode>(() => settings.librarySort)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [refreshing, setRefreshing] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [coverDialogOpen, setCoverDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null,
  )
  const toastSequence = useRef(0)
  const touchStartY = useRef<number | null>(null)
  const emptyPreview = searchParams.get('empty') === '1'
  const visibleBooks = useMemo(
    () => sortBooks(emptyPreview ? [] : library, sortMode),
    [emptyPreview, library, sortMode],
  )
  const selectionMode = selectedIds.size > 0

  useEffect(() => setView(settings.libraryLayout), [settings.libraryLayout])
  useEffect(() => setSortMode(settings.librarySort), [settings.librarySort])

  const showToast = (message: string) => {
    toastSequence.current += 1
    setToast({ id: toastSequence.current, message })
  }

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const result = await resyncLibrary()
      if (result.permissionDenied > 0) {
        showToast('Folder access was denied. Stored EPUB copies were checked.')
      } else {
        showToast(
          `Synced: ${result.added} added, ${result.relinked} relinked, ${result.missing} missing.`,
        )
      }
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Could not resync the library.',
      )
    } finally {
      setRefreshing(false)
    }
  }

  const handleTouchStart = (event: TouchEvent<HTMLElement>) => {
    touchStartY.current =
      window.scrollY <= 0 ? (event.touches[0]?.clientY ?? null) : null
  }

  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const startY = touchStartY.current
    touchStartY.current = null
    if (startY === null || refreshing) return
    const endY = event.changedTouches[0]?.clientY
    if (endY !== undefined && endY - startY > 88) void refresh()
  }

  const addImportedBook = async (file: File) => {
    return importEpubFile({ file })
  }

  const addImportedDirectory = async (directory: FileSystemDirectoryHandle) => {
    return importEpubDirectory(directory)
  }

  const deleteSelectedBooks = async () => {
    const deletedCount = selectedIds.size
    await deleteBooksFromStorage([...selectedIds])
    setSelectedIds(new Set())
    setDeleteDialogOpen(false)
    showToast(
      `Deleted ${deletedCount} ${deletedCount === 1 ? 'book' : 'books'}.`,
    )
  }

  const updateSelectedCovers = async (file: File) => {
    await saveCoverForBooks([...selectedIds], file)
    setCoverDialogOpen(false)
    setSelectedIds(new Set())
    showToast('Cover updated.')
  }

  const groupSelectedBooks = async (seriesTitle: string) => {
    const selectedCount = selectedIds.size
    await groupBooksIntoSeries([...selectedIds], seriesTitle)
    setGroupDialogOpen(false)
    setSelectedIds(new Set())
    showToast(`Grouped ${selectedCount} books as ${seriesTitle}.`)
  }

  return (
    <main
      className="library-page"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <header className="library-header">
        <div>
          <h1 className="app-page__title">Library</h1>
          {!emptyPreview && (
            <p className="library-header__count">{library.length} books</p>
          )}
        </div>
        {selectionMode ? (
          <div
            className="library-bulk-actions"
            role="toolbar"
            aria-label="Selected books"
          >
            <Badge variant="accent">{selectedIds.size} selected</Badge>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 size={16} aria-hidden="true" />
              Delete
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCoverDialogOpen(true)}
            >
              <ImagePlus size={16} aria-hidden="true" />
              Change Cover
            </Button>
            {selectedIds.size > 1 && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setGroupDialogOpen(true)}
              >
                <Layers size={16} aria-hidden="true" />
                Group as series
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              aria-label="Cancel selection"
              onClick={() => setSelectedIds(new Set())}
            >
              <X size={17} aria-hidden="true" />
              Cancel
            </Button>
          </div>
        ) : (
          <div className="library-controls">
            {visibleBooks.length > 0 && (
              <Button
                type="button"
                variant="primary"
                className="library-add"
                onClick={() => setAddDialogOpen(true)}
              >
                <BookPlus size={16} aria-hidden="true" />
                Add books
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              className="library-resync"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw
                size={16}
                aria-hidden="true"
                className={
                  refreshing
                    ? 'library-resync__icon is-spinning'
                    : 'library-resync__icon'
                }
              />
              {refreshing ? 'Syncing' : 'Resync'}
            </Button>
            <label className="library-sort">
              <span className="sr-only">Sort by</span>
              <select
                value={sortMode}
                onChange={(event) => {
                  const nextSort = event.target.value as SortMode
                  setSortMode(nextSort)
                  void updateSettings({ librarySort: nextSort }).catch(() =>
                    showToast('Could not save the library sort order.'),
                  )
                }}
              >
                {sortOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <SegmentedControl<ViewMode>
              label="Library view"
              value={view}
              options={viewOptions}
              onChange={(nextView) => {
                setView(nextView)
                void updateSettings({ libraryLayout: nextView }).catch(() =>
                  showToast('Could not save the library layout.'),
                )
              }}
            />
          </div>
        )}
      </header>

      {refreshing ? (
        <LibrarySkeleton view={view} />
      ) : visibleBooks.length === 0 ? (
        <EmptyLibraryState onAddBooks={() => setAddDialogOpen(true)} />
      ) : (
        <motion.section
          className={`library-books library-books--${view}`}
          aria-label="Books"
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.12 }}
        >
          {visibleBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              view={view}
              selected={selectedIds.has(book.id)}
              selectionMode={selectionMode}
              onSelect={() => toggleSelected(book.id)}
            />
          ))}
        </motion.section>
      )}
      <AddBooksDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onImport={addImportedBook}
        onImportDirectory={addImportedDirectory}
        onImportComplete={showToast}
      />
      <CoverDialog
        open={coverDialogOpen}
        selectedCount={selectedIds.size}
        onOpenChange={setCoverDialogOpen}
        onConfirm={updateSelectedCovers}
      />
      <DeleteBooksDialog
        open={deleteDialogOpen}
        selectedCount={selectedIds.size}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={deleteSelectedBooks}
      />
      <GroupBooksDialog
        open={groupDialogOpen}
        selectedCount={selectedIds.size}
        initialTitle={
          library.find((book) => selectedIds.has(book.id))?.title ?? ''
        }
        onOpenChange={setGroupDialogOpen}
        onConfirm={groupSelectedBooks}
      />
      <Toast
        key={toast?.id ?? 0}
        message={toast?.message ?? null}
        onDismiss={() => setToast(null)}
      />
    </main>
  )
}
