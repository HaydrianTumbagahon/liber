import { FallbackStorageProvider } from './fallbackStorageProvider.ts'
import { FolderStorageProvider } from './folderStorageProvider.ts'
import type {
  EpubImportHandler,
  StorageProvider,
  StorageStatus,
} from './types.ts'

export type {
  EpubImportHandler,
  EpubImportRequest,
  EpubImportResult,
  LibraryDiff,
  LibraryScanResult,
  StorageBackup,
  StorageProvider,
  StorageStatus,
} from './types.ts'
export { calculateLibraryDiff, resolveApplicationDirectory } from './storageUtils.ts'
export { APP_DIRECTORY_NAME } from './folderStorageProvider.ts'

class ActiveStorageProvider implements StorageProvider {
  private readonly folder = new FolderStorageProvider()
  private readonly fallback = new FallbackStorageProvider()
  private initialization: Promise<void> | null = null
  private fallbackSelected = false

  private notifyStorageChange() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('liber-storage-change'))
    }
  }

  async init() {
    if (!this.initialization) {
      this.initialization = (async () => {
        try {
          this.fallbackSelected =
            window.localStorage.getItem('liber-storage-mode') === 'fallback'
        } catch {
          this.fallbackSelected = false
        }
        await this.folder.init()
        await this.fallback.init()
      })().catch((error: unknown) => {
        this.initialization = null
        throw error
      })
    }
    return this.initialization
  }

  setImporter(importer: EpubImportHandler) {
    this.folder.setImporter(importer)
    this.fallback.setImporter(importer)
  }

  isConnected() {
    return this.folder.isConnected() && !this.fallbackSelected
  }

  getStatus(): StorageStatus {
    return this.folder.getStatus()
  }

  getFolderName() {
    return this.folder.getFolderName()
  }

  isUsingFallback() {
    return this.fallbackSelected
  }

  useInAppStorage() {
    this.fallbackSelected = true
    try {
      window.localStorage.setItem('liber-storage-mode', 'fallback')
    } catch {
      // The current selection remains active for this app session.
    }
    this.notifyStorageChange()
  }

  async reconnect() {
    await this.init()
    const status = await this.folder.reconnect()
    if (status === 'connected') this.useFolderStorage()
    this.notifyStorageChange()
    return status
  }

  private useFolderStorage() {
    this.fallbackSelected = false
    try {
      window.localStorage.removeItem('liber-storage-mode')
    } catch {
      // The current selection remains active for this app session.
    }
  }

  async connect(dirHandle: FileSystemDirectoryHandle) {
    await this.init()
    this.useFolderStorage()
    const status = await this.folder.connect(dirHandle)
    this.notifyStorageChange()
    return status
  }

  private active(): StorageProvider {
    return this.folder.isConnected() && !this.fallbackSelected
      ? this.folder
      : this.fallback
  }

  async readSettings() {
    await this.init()
    return this.active().readSettings()
  }

  async writeSettings(settings: Parameters<StorageProvider['writeSettings']>[0]) {
    await this.init()
    return this.active().writeSettings(settings)
  }

  async readProgress() {
    await this.init()
    return this.active().readProgress()
  }

  async writeProgress(
    progress: Parameters<StorageProvider['writeProgress']>[0],
    options?: Parameters<StorageProvider['writeProgress']>[1],
  ) {
    await this.init()
    return this.active().writeProgress(progress, options)
  }

  async listLibrary() {
    await this.init()
    try {
      return await this.active().listLibrary()
    } catch (error) {
      if (this.folder.getStatus() !== 'connected') this.notifyStorageChange()
      throw error
    }
  }

  async readBookFile(path: string) {
    await this.init()
    return this.active().readBookFile(path)
  }

  async copyIntoLibrary(files: readonly File[], bookFolderName: string) {
    await this.init()
    return this.active().copyIntoLibrary(files, bookFolderName)
  }

  async deleteLibraryFiles(
    paths: readonly string[],
    options: { confirmed: true },
  ) {
    await this.init()
    return this.active().deleteLibraryFiles(paths, options)
  }

  async exportData() {
    await this.init()
    return this.active().exportData()
  }

  async importData(
    data: Blob,
    options?: Parameters<StorageProvider['importData']>[1],
  ) {
    await this.init()
    return this.active().importData(data, options)
  }
}

export const storageProvider = new ActiveStorageProvider()

export function registerEpubImportHandler(handler: EpubImportHandler) {
  storageProvider.setImporter(handler)
}

export function showLibraryDirectoryPicker() {
  const picker = (
    window as Window & {
      showDirectoryPicker?: (options?: {
        mode?: 'read' | 'readwrite'
        startIn?: 'documents'
      }) => Promise<FileSystemDirectoryHandle>
    }
  ).showDirectoryPicker
  if (!picker) {
    throw new Error('Folder storage is not supported in this browser.')
  }
  return picker.call(window, { mode: 'readwrite', startIn: 'documents' })
}