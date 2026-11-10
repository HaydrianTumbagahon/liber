import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  AlertCircle,
  Check,
  FolderOpen,
  LoaderCircle,
  Upload,
} from 'lucide-react'
import { Button } from '../../components/ui/Button.tsx'
import { Dialog } from '../../components/ui/Dialog.tsx'
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
}

export function AddBooksDialog({
  open,
  onOpenChange,
  onImport,
  onImportDirectory,
  onImportComplete,
}: AddBooksDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const sequence = useRef(0)
  const [items, setItems] = useState<ImportItem[]>([])
  const [processing, setProcessing] = useState(false)
  const [folderNotice, setFolderNotice] = useState('')
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
    <Dialog open={open} title="Add books" onOpenChange={onOpenChange}>
      <div className="library-import">
        <p className="library-import__note">
          EPUB metadata, reading order, and cover images are extracted on this
          device. Book text is not rendered in this phase.
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
        <div className="library-import__actions">
          <Button
            type="button"
            variant="primary"
            size="large"
            disabled={processing}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={17} aria-hidden="true" />
            Choose EPUB files
          </Button>
          {supportsFolderPicker && (
            <Button
              type="button"
              variant="secondary"
              size="large"
              disabled={processing}
              onClick={chooseFolder}
            >
              <FolderOpen size={17} aria-hidden="true" />
              Choose folder
            </Button>
          )}
        </div>
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
    </Dialog>
  )
}
