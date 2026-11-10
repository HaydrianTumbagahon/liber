import { useEffect, useMemo, useRef, useState } from 'react'
import type { TouchEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import {
  BookPlus,
  ImagePlus,
  Layers,
  LayoutGrid,
  List,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '../../components/ui/Badge.tsx'
import { Button } from '../../components/ui/Button.tsx'
import { IconToggle } from '../../components/ui/IconToggle.tsx'
import { IconButton } from '../../components/ui/IconButton.tsx'
import { Select } from '../../components/ui/Select.tsx'
import { Skeleton } from '../../components/ui/Skeleton.tsx'
import { useToast } from '../../components/ui/Toast.tsx'
import { useStatusBanner } from '../../components/ui/StatusBanner.tsx'
import type { ToastVariant } from '../../components/ui/Toast.tsx'
import { parseEpubFile } from '../../data/epubParser.ts'
import type {
  DirectoryImportResult,
  ImportEpubResult,
} from '../../data/libraryRepository.ts'
import { Tooltip } from '../../components/ui/Tooltip.tsx'
import { useSettings } from '../../lib/theme.tsx'
import { storageProvider } from '../../lib/storage/index.ts'
import type { LibraryLayout, LibrarySort } from '../../lib/theme.tsx'
import { useLibrary } from './useLibrary.ts'
import {
  motionDurations,
  motionEasings,
  resolveMotionPreset,
} from '../../lib/motion.ts'
import type { Book, BookStatus } from '../../data/mockBooks.ts'
import { AddBooksDialog } from './AddBooksDialog.tsx'
import { BookCard } from './BookCard.tsx'
import { CoverDialog } from './CoverDialog.tsx'
import { DeleteBooksDialog } from './DeleteBooksDialog.tsx'
import {
  ADD_BOOKS_MODAL_LAYOUT_ID,
  EmptyLibraryState,
} from './EmptyLibraryState.tsx'
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

type ResyncFeedbackResult = {
  added: number | readonly Pick<Book, 'title'>[]
  removed?: number
  missing?: number
  relinked?: number
  errors?: number
  permissionDenied?: number
}

const viewOptions = [
  { label: 'Grid view', value: 'grid', icon: <LayoutGrid size={17} /> },
  { label: 'List view', value: 'list', icon: <List size={17} /> },
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

function getResyncFeedback(result: ResyncFeedbackResult) {
  if ((result.permissionDenied ?? 0) > 0) {
    return {
      kind: 'warning' as const,
      message: 'Folder access was denied. Stored EPUB copies were checked.',
    }
  }

  const addedBooks = typeof result.added === 'number' ? null : result.added
  const addedCount =
    typeof result.added === 'number' ? result.added : result.added.length
  const removedCount = result.removed ?? 0
  const missingCount = result.missing ?? 0
  const relinkedCount = result.relinked ?? 0
  const changedCount = addedCount + removedCount + missingCount + relinkedCount

  if (changedCount === 0 && (result.errors ?? 0) > 0) {
    return {
      kind: 'warning' as const,
      message: `Library scan finished with ${result.errors} file ${result.errors === 1 ? 'error' : 'errors'}.`,
    }
  }
  if (changedCount === 0) return { kind: 'up-to-date' as const }

  const parts: string[] = []
  if (addedCount > 0) {
    let addedMessage = `${addedCount} new ${addedCount === 1 ? 'book' : 'books'} added`
    if (addedBooks?.length) {
      const titles = addedBooks.slice(0, 3).map((book) => book.title)
      const remaining = addedCount - titles.length
      addedMessage += `: ${titles.join(', ')}${remaining > 0 ? `, and ${remaining} more` : ''}`
    }
    parts.push(addedMessage)
  }
  if (relinkedCount > 0) {
    parts.push(
      `${relinkedCount} ${relinkedCount === 1 ? 'book' : 'books'} relinked`,
    )
  }
  if (removedCount > 0) {
    parts.push(`${removedCount} source ${removedCount === 1 ? 'file' : 'files'} removed`)
  }
  if (missingCount > 0) {
    parts.push(
      `${missingCount} ${missingCount === 1 ? 'book' : 'books'} missing`,
    )
  }
  if ((result.errors ?? 0) > 0) {
    parts.push(
      `${result.errors} ${result.errors === 1 ? 'file error' : 'file errors'}`,
    )
  }

  return { kind: 'result' as const, message: parts.join(' · ') }
}

function safeBookFolderName(title: string, fileName: string) {
  const fallback = fileName.replace(/\.epub$/i, '')
  const invalidCharacters = new Set('<>:"/\\|?*')
  const cleaned = Array.from(title || fallback, (character) =>
    invalidCharacters.has(character) || character.charCodeAt(0) < 32
      ? ' '
      : character,
  )
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : 'Untitled book'
}

async function inferBookFolderName(file: File) {
  const parsed = await parseEpubFile(file)
  return safeBookFolderName(parsed.seriesName?.trim() || parsed.title, file.name)
}

async function collectFolderImports(directory: FileSystemDirectoryHandle) {
  const groups = new Map<string, File[]>()
  const errors: DirectoryImportResult['files'] = []

  const visit = async (
    current: FileSystemDirectoryHandle,
    inheritedFolderName?: string,
  ): Promise<void> => {
    for await (const [name, entry] of current.entries()) {
      if (entry.kind === 'directory') {
        await visit(entry, inheritedFolderName ?? name)
        continue
      }
      if (!name.toLowerCase().endsWith('.epub')) continue

      const file = await entry.getFile()
      try {
        const folderName = inheritedFolderName ?? (await inferBookFolderName(file))
        const files = groups.get(folderName) ?? []
        files.push(file)
        groups.set(folderName, files)
      } catch (error) {
        errors.push({
          name,
          outcome: null,
          errorMessage:
            error instanceof Error ? error.message : 'Could not read this EPUB.',
        })
      }
    }
  }

  await visit(directory)
  return { groups, errors }
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
  const [addDialogLayoutId, setAddDialogLayoutId] = useState<string>()
  const [coverDialogOpen, setCoverDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const hasAnimatedCards = useRef(false)
  const showToast = useToast()
  const statusBanner = useStatusBanner()
  const touchStartY = useRef<number | null>(null)
  const emptyPreview = searchParams.get('empty') === '1'
  const visibleBooks = useMemo(
    () => sortBooks(emptyPreview ? [] : library, sortMode),
    [emptyPreview, library, sortMode],
  )
  const selectionMode = selectedIds.size > 0

  useEffect(() => setView(settings.libraryLayout), [settings.libraryLayout])
  useEffect(() => setSortMode(settings.librarySort), [settings.librarySort])
  useEffect(() => {
    if (visibleBooks.length > 0) hasAnimatedCards.current = true
  }, [visibleBooks.length])

  const notify = (message: string, variant: ToastVariant = 'success') => {
    showToast({ message, variant })
  }

  const openAddBooks = (layoutId?: string) => {
    setAddDialogLayoutId(layoutId)
    setAddDialogOpen(true)
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
    statusBanner.working('Resyncing library…')
    try {
      const result = await resyncLibrary()
      const feedback = getResyncFeedback(result)
      if (feedback.kind === 'up-to-date') {
        statusBanner.hide()
        notify('Library is up to date. No new updates found.', 'info')
      } else if (feedback.kind === 'warning') {
        statusBanner.hide()
        notify(feedback.message, 'warning')
      } else {
        statusBanner.done(feedback.message)
      }
    } catch (error) {
      statusBanner.hide()
      notify(
        error instanceof Error
          ? error.message
          : 'Could not resync the library.',
        'error',
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
    if (!storageProvider.isConnected()) return importEpubFile({ file })

    const bookFolderName = await inferBookFolderName(file)
    const [path] = await storageProvider.copyIntoLibrary([file], bookFolderName)
    const result = await storageProvider.listLibrary()
    const volume = result.volumes.find(
      (candidate) =>
        candidate.sourceDirectoryId === 'app-root' &&
        candidate.sourceRelativePath === path,
    )
    const book = volume
      ? result.books.find((candidate) => candidate.id === volume.bookId)
      : undefined
    if (!volume || !book) throw new Error('The imported EPUB was not indexed.')
    return {
      bookId: book.id,
      title: book.title,
      volumeNumber: volume.number,
      outcome: 'added',
    } satisfies ImportEpubResult
  }

  const addImportedDirectory = async (
    directory: FileSystemDirectoryHandle,
  ): Promise<DirectoryImportResult> => {
    if (!storageProvider.isConnected()) return importEpubDirectory(directory)

    const { groups, errors } = await collectFolderImports(directory)
    const files = [...errors]
    const foundPaths: string[] = []
    for (const [bookFolderName, epubFiles] of groups) {
      try {
        const paths = await storageProvider.copyIntoLibrary(
          epubFiles,
          bookFolderName,
        )
        foundPaths.push(...paths)
        const result = await storageProvider.listLibrary()
        for (const path of paths) {
          const volume = result.volumes.find(
            (candidate) => candidate.sourceRelativePath === path,
          )
          const book = volume
            ? result.books.find((candidate) => candidate.id === volume.bookId)
            : undefined
          files.push({
            name: path,
            outcome: volume && book ? 'added' : null,
            errorMessage:
              volume && book ? null : 'The imported EPUB was not indexed.',
          })
        }
      } catch (error) {
        for (const file of epubFiles) {
          files.push({
            name: file.name,
            outcome: null,
            errorMessage:
              error instanceof Error ? error.message : 'Could not copy this EPUB.',
          })
        }
      }
    }
    return {
      files,
      permissionDenied: false,
      foundPaths,
      scanComplete: true,
    }
  }

  const deleteSelectedBooks = async () => {
    const deletedCount = selectedIds.size
    await deleteBooksFromStorage([...selectedIds])
    setSelectedIds(new Set())
    setDeleteDialogOpen(false)
    notify(`Deleted ${deletedCount} ${deletedCount === 1 ? 'book' : 'books'}.`)
  }

  const updateSelectedCovers = async (file: File) => {
    await saveCoverForBooks([...selectedIds], file)
    setCoverDialogOpen(false)
    setSelectedIds(new Set())
    notify('Cover updated.')
  }

  const groupSelectedBooks = async (seriesTitle: string) => {
    const selectedCount = selectedIds.size
    await groupBooksIntoSeries([...selectedIds], seriesTitle)
    setGroupDialogOpen(false)
    setSelectedIds(new Set())
    notify(`Grouped ${selectedCount} books as ${seriesTitle}.`)
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
                onClick={() => openAddBooks(ADD_BOOKS_MODAL_LAYOUT_ID)}
              >
                {!reduceMotion && (
                  <motion.span
                    className="library-add-morph"
                    layoutId={ADD_BOOKS_MODAL_LAYOUT_ID}
                    aria-hidden="true"
                  />
                )}
                <BookPlus size={16} aria-hidden="true" />
                Add books
              </Button>
            )}
            <div className="library-resync-desktop">
              <Tooltip content="Resync library">
                <IconButton
                  label="Resync library"
                  className="library-resync-icon"
                  disabled={refreshing}
                  whileTap={undefined}
                  onClick={() => void refresh()}
                >
                  <RefreshCw
                    size={18}
                    aria-hidden="true"
                    className={
                      refreshing
                        ? 'library-resync__icon is-spinning'
                        : 'library-resync__icon'
                    }
                  />
                </IconButton>
              </Tooltip>
            </div>
            <div className="library-sort">
              <Select<SortMode>
                label="Sort by"
                value={sortMode}
                options={sortOptions}
                className="library-sort__select"
                onChange={(nextSort) => {
                  setSortMode(nextSort)
                  void updateSettings({ librarySort: nextSort }).catch(() =>
                    notify('Could not save the library sort order.', 'error'),
                  )
                }}
              />
            </div>
            <IconToggle<ViewMode>
              label="Library view"
              value={view}
              options={viewOptions}
              onChange={(nextView) => {
                setView(nextView)
                void updateSettings({ libraryLayout: nextView }).catch(() =>
                  notify('Could not save the library layout.', 'error'),
                )
              }}
            />
          </div>
        )}
      </header>

      {refreshing ? (
        <LibrarySkeleton view={view} />
      ) : visibleBooks.length === 0 ? (
        <EmptyLibraryState
          folderStorage={storageProvider.isConnected()}
          onAddBooks={() => openAddBooks(ADD_BOOKS_MODAL_LAYOUT_ID)}
        />
      ) : (
        <motion.section
          className={`library-books library-books--${view}`}
          aria-label="Books"
          variants={
            resolveMotionPreset('listContainer', Boolean(reduceMotion)).variants
          }
          initial={hasAnimatedCards.current ? false : 'initial'}
          animate="animate"
          transition={{
            duration: motionDurations.base,
            ease: motionEasings.standard,
            staggerChildren: reduceMotion ? 0 : 0.04,
          }}
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
        layoutId={addDialogLayoutId}
        onImport={addImportedBook}
        onImportDirectory={addImportedDirectory}
        onImportComplete={notify}
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
    </main>
  )
}
