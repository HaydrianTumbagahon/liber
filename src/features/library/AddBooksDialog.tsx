import { useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import {
  AlertCircle,
  Check,
  FolderOpen,
  LoaderCircle,
  Upload,
} from 'lucide-react'
import { Button } from '../../components/ui/Button.tsx'
import { Modal } from '../../components/ui/Modal.tsx'
import type {
  DirectoryImportResult,
  ImportEpubResult,
} from '../../data/libraryRepository.ts'

type ImportStatus = 'loading' | 'success' | 'error'

type ImportItem = {
  id: number
  name: string
  size: number
  status: ImportStatus
  errorMessage: string | null
  outcome: ImportEpubResult['outcome'] | null
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
}

type AddBooksDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (file: File) => Promise<ImportEpubResult>
  onImportDirectory: (
    handle: FileSystemDirectoryHandle,
  ) => Promise<DirectoryImportResult>
  onImportComplete: (message: string) => void
  layoutId?: string
}

export function AddBooksDialog({
  open,
  onOpenChange,
  onImport,
  onImportDirectory,
  onImportComplete,
  layoutId,
}: AddBooksDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const sequence = useRef(0)
  const [items, setItems] = useState<ImportItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [folderNotice, setFolderNotice] = useState('')
  const [draggingFiles, setDraggingFiles] = useState(false)
  const supportsFolderPicker =
    typeof window !== 'undefined' &&
    typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function'

  const processFiles = (files: readonly File[]) => {
    if (files.length === 0) return

    const queued = files.map((file) => ({
      id: ++sequence.current,
      name: file.name,
      file,
      size: file.size,
      status: 'loading' as const,
      errorMessage: null,
      outcome: null,
    }))

    setItems(queued)
    setFolderNotice('')
    setProcessing(true)

    void (async () => {
      const results: ImportEpubResult[] = []
      for (const item of queued) {
        const valid = item.name.toLowerCase().endsWith('.epub') && item.size > 0
        let status: ImportStatus = 'error'
        let errorMessage: string | null = 'Choose a non-empty EPUB file.'
        let outcome: ImportEpubResult['outcome'] | null = null

        if (valid) {
          try {
            const result = await onImport(item.file)
            results.push(result)
            outcome = result.outcome
            status = 'success'
            errorMessage = null
          } catch (error) {
            errorMessage =
              error instanceof Error
                ? error.message
                : 'Could not import this EPUB.'
          }
        }

        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, status, errorMessage, outcome }
              : entry,
          ),
        )
      }

      setProcessing(false)
      if (results.length > 0) {
        const added = results.filter(
          (result) => result.outcome === 'added',
        ).length
        const relinked = results.filter(
          (result) => result.outcome === 'relinked',
        ).length
        const alreadyPresent = results.length - added - relinked
        const message =
          results.length === 1
            ? results[0].outcome === 'relinked'
              ? `Relinked ${results[0].title}; progress restored.`
              : results[0].outcome === 'already-present'
                ? `Already in library: ${results[0].title}.`
                : `Added ${results[0].title}.`
            : `Added ${added}, relinked ${relinked}, already present ${alreadyPresent}.`
        onImportComplete(message)
      }
    })()
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(event.currentTarget.files ?? []))
    event.currentTarget.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    setDraggingFiles(false)
    if (!processing) processFiles(Array.from(event.dataTransfer.files))
  }

  const handleDragLeave = (event: DragEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDraggingFiles(false)
    }
  }

  const chooseFolder = async () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker
    if (!picker) return

    setProcessing(true)
    setFolderNotice('Reading selected folder...')
    try {
      const directory = await picker.call(window)
      const result = await onImportDirectory(directory)
      setItems(
        result.files.map((file) => ({
          id: ++sequence.current,
          name: file.name,
          size: 0,
          status: file.errorMessage ? 'error' : 'success',
          errorMessage: file.errorMessage,
          outcome: file.outcome,
        })),
      )
      if (result.permissionDenied) {
        setFolderNotice(
          'Folder access was denied. Allow read access and retry.',
        )
      } else if (result.files.length === 0) {
        setFolderNotice('No EPUB files found in the selected folder.')
      } else {
        setFolderNotice(
          `Scanned ${result.files.length} EPUB files in ${directory.name}.`,
        )
      }
      const imported = result.files.filter((file) => file.outcome !== null)
      if (imported.length > 0) {
        const added = imported.filter((file) => file.outcome === 'added').length
        const relinked = imported.filter(
          (file) => file.outcome === 'relinked',
        ).length
        const alreadyPresent = imported.length - added - relinked
        onImportComplete(
          `Folder scan: added ${added}, relinked ${relinked}, already present ${alreadyPresent}.`,
        )
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setFolderNotice('')
        return
      }
      setFolderNotice('The folder picker could not be opened.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Add books"
      onOpenChange={onOpenChange}
      motionPreset="springBounce"
      layoutId={layoutId}
      className="library-add-modal"
    >
      <div className="library-import">
        <p className="library-import__note library-import__note--centered">
          EPUB files are processed on this device. Choose one or more files, or
          drop them below.
        </p>
        <input
          ref={inputRef}
          className="library-import__input"
          hidden
          type="file"
          accept=".epub,application/epub+zip"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="primary"
          size="large"
          className={`library-import__dropzone${draggingFiles ? ' is-dragging' : ''}`}
          aria-label="Choose EPUB files or drop them here"
          disabled={processing}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault()
            setDraggingFiles(true)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {processing ? (
            <LoaderCircle
              size={24}
              className="library-import__dropzone-icon is-spinning"
              aria-hidden="true"
            />
          ) : (
            <Upload size={24} aria-hidden="true" />
          )}
          <span className="library-import__dropzone-title">
            {processing ? 'Processing EPUB files' : 'Choose EPUB files'}
          </span>
          <span className="library-import__dropzone-hint">
            {draggingFiles ? 'Drop files to import' : 'or drop EPUB files here'}
          </span>
        </Button>
        {supportsFolderPicker && (
          <div className="library-import__actions">
            <Button
              type="button"
              variant="secondary"
              disabled={processing}
              onClick={chooseFolder}
            >
              <FolderOpen size={17} aria-hidden="true" />
              Choose folder instead
            </Button>
          </div>
        )}
        {folderNotice && (
          <p className="library-import__notice" role="status">
            {folderNotice}
          </p>
        )}
        {items.length > 0 && (
          <ol
            className="library-import-list"
            aria-label="EPUB processing status"
            aria-live="polite"
          >
            {items.map((item) => (
              <li
                className={`library-import-item library-import-item--${item.status}`}
                key={item.id}
              >
                {item.status === 'loading' ? (
                  <LoaderCircle
                    size={17}
                    className="library-import-item__icon is-spinning"
                    aria-hidden="true"
                  />
                ) : item.status === 'success' ? (
                  <Check
                    size={17}
                    className="library-import-item__icon"
                    aria-hidden="true"
                  />
                ) : (
                  <AlertCircle
                    size={17}
                    className="library-import-item__icon"
                    aria-hidden="true"
                  />
                )}
                <span className="library-import-item__name">{item.name}</span>
                <span className="library-import-item__status">
                  {item.status === 'loading'
                    ? 'Processing'
                    : item.status === 'error'
                      ? item.errorMessage
                      : item.outcome === 'relinked'
                        ? 'Relinked; progress restored'
                        : item.outcome === 'already-present'
                          ? 'Already in library'
                          : 'Added on device'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  )
}
