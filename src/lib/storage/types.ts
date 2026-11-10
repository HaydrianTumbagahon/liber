import type {
  DatabaseBook,
  DatabaseProgress,
  DatabaseVolume,
  ProgressPosition,
} from '../../data/database.ts'
import type { ParsedEpub } from '../../data/epubParser.ts'
import type { AppSettings } from '../theme.tsx'

export type StorageStatus =
  | 'not-configured'
  | 'needs-permission'
  | 'folder-missing'
  | 'connected'
  | 'unsupported'

export type LibraryDiff = {
  added: string[]
  removed: string[]
  changed: string[]
}

export type LibraryScanResult = {
  books: DatabaseBook[]
  volumes: DatabaseVolume[]
  diff: LibraryDiff
  errors: string[]
}

export type EpubImportRequest = {
  file: File
  epub: ParsedEpub
  sourceDirectoryId?: string
  sourceRelativePath?: string
  bookFolderName?: string
  volumeNumber?: number | null
  bookCover?: Blob | null
}

export type EpubImportResult = {
  bookId: string
  title: string
  volumeNumber: number
  outcome: 'added' | 'merged' | 'relinked' | 'already-present'
}

export type EpubImportHandler = (
  request: EpubImportRequest,
) => Promise<EpubImportResult>

export type LibraryCopyResult = {
  path: string
  skipped: boolean
  outcome?: EpubImportResult['outcome']
}

export type StorageBackup = {
  schemaVersion: 1
  exportedAt: string
  settings: AppSettings
  progress: DatabaseProgress[]
}

export interface StorageProvider {
  init(): Promise<void>
  isConnected(): boolean
  connect(dirHandle: FileSystemDirectoryHandle): Promise<StorageStatus>
  getStatus(): StorageStatus
  readSettings(): Promise<AppSettings>
  writeSettings(settings: AppSettings): Promise<void>
  readProgress(): Promise<DatabaseProgress[]>
  writeProgress(
    progress: DatabaseProgress | readonly DatabaseProgress[],
    options?: {
      replace?: boolean
      removeStableKeys?: readonly string[]
    },
  ): Promise<void>
  listLibrary(): Promise<LibraryScanResult>
  readBookFile(path: string): Promise<File>
  copyIntoLibrary(
    files: readonly File[],
    bookFolderName: string,
    options?: {
      folderCover?: File | null
      volumeNumbers?: readonly (number | null)[]
      parsedEpubs?: readonly ParsedEpub[]
    },
  ): Promise<LibraryCopyResult[]>
  deleteLibraryFiles(
    paths: readonly string[],
    options: { confirmed: true },
  ): Promise<void>
  exportData(): Promise<Blob>
  importData(data: Blob, options?: { replaceExisting?: boolean }): Promise<void>
}

export type StorageProgressPosition = ProgressPosition