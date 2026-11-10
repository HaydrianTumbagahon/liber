import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import {
  AlertCircle,
  Check,
  FolderOpen,
  LoaderCircle,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '../../components/ui/Button.tsx'
import { Modal } from '../../components/ui/Modal.tsx'
import type { ImportEpubResult } from '../../data/libraryRepository.ts'
import type { ToastVariant } from '../../components/ui/Toast.tsx'
import {
  canSelectFolderWithInput,
  collectDirectoryHandleFiles,
  collectDroppedEntries,
  collectInputFiles,
  createImportGroups,
} from './importFileUtils.ts'
import type { ImportFileGroup } from './importFileUtils.ts'
import { getFolderAccessSupport, showImportDirectoryPicker } from '../../lib/storage/index.ts'

type VolumeStatus = 'loading' | 'success' | 'skipped' | 'error'
type BookStatus = 'loading' | 'success' | 'skipped' | 'error'

type ImportVolumeItem = {
  id: number
  name: string
  status: VolumeStatus
  errorMessage: string | null
  outcome: ImportEpubResult['outcome'] | null
}

type ImportBookItem = {
  id: number
  title: string
  status: BookStatus
  volumes: ImportVolumeItem[]
}

type ImportCallbackResult = ImportEpubResult

type AddBooksDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (
    file: File,
    bookFolderName?: string,
    folderCover?: File | null,
  ) => Promise<ImportCallbackResult>
  onImportComplete: (message: string, variant?: ToastVariant) => void
  layoutId?: string
}

function summarizeImport(
  results: readonly ImportCallbackResult[],
  failed: number,
) {
  const books = new Map<string, ImportCallbackResult[]>()
  for (const result of results) {
    const current = books.get(result.bookId) ?? []
    current.push(result)
    books.set(result.bookId, current)
  }
  const skipped = results.filter(
    (result) => result.outcome === 'already-present',
  ).length
  const parts: string[] = []
  for (const bookResults of books.values()) {
    const newBook = bookResults.some((result) => result.outcome === 'added')
    const addedCount = bookResults.filter(
      (result) => result.outcome !== 'already-present',
    ).length
    const title = bookResults[0]?.title ?? 'book'
    if (addedCount === 0) continue
    if (newBook) {
      parts.push(
        `Added ${title} with ${addedCount} ${addedCount === 1 ? 'volume' : 'volumes'}`,
      )
    } else {
      parts.push(
        `Added ${addedCount} ${addedCount === 1 ? 'volume' : 'volumes'} to ${title}`,
      )
    }
  }
  if (skipped > 0) {
    parts.push(`Skipped ${skipped} duplicate ${skipped === 1 ? 'volume' : 'volumes'}`)
  }
  if (failed > 0) parts.push(`${failed} ${failed === 1 ? 'file' : 'files'} failed`)
  return parts.length > 0 ? parts.join('; ') : 'No EPUB files were found.'
}

export function AddBooksDialog({
  open,
  onOpenChange,
  onImport,
  onImportComplete,
  layoutId,
}: AddBooksDialogProps) {
  const filesInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const sequence = useRef(0)
  const [items, setItems] = useState<ImportBookItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [finished, setFinished] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [folderNotice, setFolderNotice] = useState('')
  const supportsPicker = getFolderAccessSupport().supported
  const supportsDirectoryInput = canSelectFolderWithInput()
  const supportsFolders = supportsPicker || supportsDirectoryInput

  const processGroups = async (
    groups: readonly ImportFileGroup[],
    collectionErrors: readonly string[] = [],
  ) => {
    if (groups.length === 0) {
      setFolderNotice(collectionErrors.join(' ') || 'No EPUB files were found.')
      setProcessing(false)
      setFinished(false)
      if (collectionErrors.length > 0) {
        onImportComplete(
          `${collectionErrors.length} ${collectionErrors.length === 1 ? 'item' : 'items'} could not be read.`,
          'warning',
        )
      }
      return
    }

    const queued = groups.map((group) => ({
      id: ++sequence.current,
      title: group.bookFolderName ?? group.files[0]?.name ?? 'EPUB files',
      status: 'loading' as const,
      volumes: group.files.map((file) => ({
        id: ++sequence.current,
        name: file.name,
        file,
        status: 'loading' as const,
        errorMessage: null,
        outcome: null,
      })),
      folder: group,
    }))

    setItems(
      queued.map(({ id, title, status, volumes }) => ({
        id,
        title,
        status,
        volumes,
      })),
    )
    setFolderNotice(collectionErrors.join(' '))
    setFinished(false)
    setProcessing(true)

    const results: ImportCallbackResult[] = []
    let failed = collectionErrors.length
    for (const book of queued) {
      let bookFailed = false
      const bookResults: ImportCallbackResult[] = []
      for (const [volumeIndex, volume] of book.volumes.entries()) {
        try {
          const result = await onImport(
            volume.file,
            book.folder.bookFolderName ?? undefined,
            volumeIndex === 0 ? book.folder.coverFile : null,
          )
          results.push(result)
          bookResults.push(result)
          const status: VolumeStatus =
            result.outcome === 'already-present' ? 'skipped' : 'success'
          setItems((current) =>
            current.map((item) =>
              item.id === book.id
                ? {
                    ...item,
                    volumes: item.volumes.map((entry) =>
                      entry.id === volume.id
                        ? { ...entry, status, outcome: result.outcome }
                        : entry,
                    ),
                  }
                : item,
            ),
          )
        } catch (error) {
          failed += 1
          bookFailed = true
          setItems((current) =>
            current.map((item) =>
              item.id === book.id
                ? {
                    ...item,
                    status: 'error',
                    volumes: item.volumes.map((entry) =>
                      entry.id === volume.id
                        ? {
                            ...entry,
                            status: 'error',
                            errorMessage:
                              error instanceof Error
                                ? error.message
                                : 'Could not import this EPUB.',
                          }
                        : entry,
                    ),
                  }
                : item,
            ),
          )
        }
      }
      if (!bookFailed) {
        const status: BookStatus =
          bookResults.length > 0 &&
          bookResults.every((result) => result.outcome === 'already-present')
            ? 'skipped'
            : 'success'
        setItems((current) =>
          current.map((item) =>
            item.id === book.id ? { ...item, status } : item,
          ),
        )
      }
    }

    setProcessing(false)
    setFinished(true)
    onImportComplete(summarizeImport(results, failed), failed > 0 ? 'warning' : 'success')
  }

  const processFiles = (files: readonly File[]) => {
    void processGroups(collectInputFiles(files))
  }

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(event.currentTarget.files ?? []))
    event.currentTarget.value = ''
  }

  const handleFolderInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(event.currentTarget.files ?? []))
    event.currentTarget.value = ''
  }

  const chooseFolder = async () => {
    if (!supportsFolders) return
    if (!supportsPicker) {
      folderInputRef.current?.click()
      return
    }
    setProcessing(true)
    setFolderNotice('Reading selected folder...')
    try {
      const directory = await showImportDirectoryPicker()
      const entries = await collectDirectoryHandleFiles(directory)
      const groups = createImportGroups(entries)
      await processGroups(groups)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setFolderNotice('')
        setProcessing(false)
        return
      }
      setFolderNotice(
        error instanceof Error ? error.message : 'Could not read the selected folder.',
      )
      setProcessing(false)
    }
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    if (processing) return
    setProcessing(true)
    try {
      const { groups, errors } = await collectDroppedEntries(event.dataTransfer)
      setProcessing(false)
      await processGroups(groups, errors)
    } catch (error) {
      setProcessing(false)
      setFolderNotice(
        error instanceof Error ? error.message : 'Could not read dropped files.',
      )
    }
  }

  return (
    <Modal
      open={open}
      title="Add light novels"
      onOpenChange={onOpenChange}
      motionPreset="springBounce"
      layoutId={layoutId}
      className="library-add-modal"
    >
      <div className="library-import">
        <p className="library-import__note library-import__note--centered">
          Drop a folder with all the volumes, or EPUB files.
        </p>
        <input
          ref={filesInputRef}
          className="library-import__input"
          hidden
          type="file"
          accept=".epub,application/epub+zip"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFilesChange}
        />
        <input
          ref={(input) => {
            folderInputRef.current = input
            input?.setAttribute('webkitdirectory', '')
            input?.setAttribute('directory', '')
          }}
          className="library-import__input"
          hidden
          type="file"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFolderInputChange}
        />
        <div
          className={`library-import__dropzone${dragging ? ' is-dragging' : ''}`}
          role="group"
          aria-label="Drop folders or EPUB files to add light novels"
          onDragEnter={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDragging(false)
            }
          }}
          onDrop={(event) => void handleDrop(event)}
        >
          {processing ? (
            <LoaderCircle
              size={24}
              className="library-import__dropzone-icon is-spinning"
              aria-hidden="true"
            />
          ) : (
            <Upload size={24} className="library-import__dropzone-icon" aria-hidden="true" />
          )}
          <span className="library-import__dropzone-title">
            {dragging ? 'Drop to add' : 'Drop folders or EPUB files here'}
          </span>
          <div className="library-import__actions">
            {supportsFolders && (
              <Button
                type="button"
                variant="secondary"
                disabled={processing}
                onClick={() => void chooseFolder()}
              >
                <FolderOpen size={17} aria-hidden="true" />
                Choose folder
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              disabled={processing}
              onClick={() => filesInputRef.current?.click()}
            >
              <Upload size={17} aria-hidden="true" />
              Choose files
            </Button>
          </div>
          {!supportsFolders && (
            <span className="library-import__dropzone-hint">
              This browser cannot select folders. Choose EPUB files instead.
            </span>
          )}
        </div>
        {folderNotice && (
          <p className="library-import__notice" role="status">
            {folderNotice}
          </p>
        )}
        {items.length > 0 && (
          <ol className="library-import-list" aria-label="Import progress" aria-live="polite">
            {items.map((book) => (
              <li className={`library-import-book library-import-book--${book.status}`} key={book.id}>
                <div className="library-import-book__heading">
                  <strong>{book.title}</strong>
                  {book.status === 'loading' ? (
                    <LoaderCircle size={16} className="is-spinning" aria-hidden="true" />
                  ) : book.status === 'error' ? (
                    <AlertCircle size={16} aria-hidden="true" />
                  ) : (
                    <Check size={16} aria-hidden="true" />
                  )}
                  <span className="library-import-book__result">
                    {book.status === 'loading'
                      ? 'Adding'
                      : book.status === 'error'
                        ? 'Some volumes failed'
                        : book.status === 'skipped'
                          ? 'Skipped (duplicates)'
                          : 'Added'}
                  </span>
                </div>
                <ol className="library-import-volumes">
                  {book.volumes.map((volume) => (
                    <li
                      className={`library-import-item library-import-item--${volume.status}`}
                      key={volume.id}
                    >
                      {volume.status === 'loading' ? (
                        <LoaderCircle size={15} className="is-spinning" aria-hidden="true" />
                      ) : volume.status === 'error' ? (
                        <AlertCircle size={15} aria-hidden="true" />
                      ) : (
                        <Check size={15} aria-hidden="true" />
                      )}
                      <span className="library-import-item__name">{volume.name}</span>
                      <span className="library-import-item__status">
                        {volume.status === 'loading'
                          ? 'Adding'
                          : volume.status === 'error'
                            ? volume.errorMessage
                            : volume.status === 'skipped'
                              ? 'Skipped (duplicate)'
                              : volume.outcome === 'merged'
                                ? 'Added to existing book'
                                : 'Added'}
                      </span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
        )}
        {finished && (
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            <X size={16} aria-hidden="true" />
            Done
          </Button>
        )}
      </div>
    </Modal>
  )
}