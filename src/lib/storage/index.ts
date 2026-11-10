import { db } from '../../data/database.ts'
import { FallbackStorageProvider } from './fallbackStorageProvider.ts'
import { FolderStorageProvider } from './folderStorageProvider.ts'
import type {
  EpubImportHandler,
  StorageProvider,
  StorageStatus,
} from './types.ts'
import {
  getFolderAccessAssessment,
  getFolderAccessChecks,
  logFolderAccessChecks,
} from './storageUtils.ts'

export type {
  EpubImportHandler,
  EpubImportRequest,
  EpubImportResult,
  LibraryDiff,
  LibraryCopyResult,
  LibraryScanResult,
  StorageBackup,
  StorageProvider,
  StorageStatus,
} from './types.ts'
export {
  assessFolderAccess,
  calculateLibraryDiff,
  resolveApplicationDirectory,
} from './storageUtils.ts'
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

  isReady() {
    return this.folder.isConnected() || this.fallbackSelected
  }

  useInAppStorage() {
    this.fallbackSelected = true
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
  }

  async connect(dirHandle: FileSystemDirectoryHandle) {
    await this.init()
    this.useFolderStorage()
    const status = await this.folder.connect(dirHandle)
    this.notifyStorageChange()
    return status
  }

  private active(): StorageProvider {
    if (this.folder.isConnected() && !this.fallbackSelected) return this.folder
    if (this.fallbackSelected) return this.fallback
    throw new Error('Choose a library folder or explicitly select in-app storage first.')
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

  async copyIntoLibrary(
    files: readonly File[],
    bookFolderName: string,
    options?: Parameters<StorageProvider['copyIntoLibrary']>[2],
  ) {
    await this.init()
    return this.active().copyIntoLibrary(files, bookFolderName, options)
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

export function getFolderAccessSupport() {
  return getFolderAccessAssessment()
}

export function logFolderAccessSupport() {
  return logFolderAccessChecks()
}

export function describeFolderPickerError(error: unknown) {
  const name = error instanceof Error ? error.name : 'UnknownError'
  switch (name) {
    case 'SecurityError':
      return {
        name,
        message:
          'The browser blocked folder access in this page. Open the site directly over HTTPS and retry.',
      }
    case 'NotAllowedError':
      return {
        name,
        message:
          'Folder access was denied. Allow access in your browser settings, then retry.',
      }
    case 'TypeError':
      return {
        name,
        message:
          'The folder picker is unavailable in this browser context. Open this site directly in a supported browser and retry.',
      }
    default:
      return {
        name,
        message: 'Could not open the folder picker. Retry or use in-app storage.',
      }
  }
}

function browserName(userAgent: string) {
  if (/Edg\//.test(userAgent)) return 'Edge'
  if (/Firefox\//.test(userAgent)) return 'Firefox'
  if (/Chrome\//.test(userAgent)) return 'Chrome'
  if (/Safari\//.test(userAgent)) return 'Safari'
  return 'Unknown'
}

export async function logStorageDiagnostics() {
  await storageProvider.init()
  const support = getFolderAccessChecks()
  const persisted = await db.directories.get('app-root')
  const handle = persisted?.handle
  let permissionState = 'no persisted handle'
  if (handle) {
    const permissionHandle = handle as FileSystemDirectoryHandle & {
      queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>
    }
    if (permissionHandle.queryPermission) {
      try {
        permissionState = await permissionHandle.queryPermission({ mode: 'readwrite' })
      } catch (error) {
        permissionState = error instanceof Error ? `error: ${error.name}` : 'error'
      }
    } else {
      permissionState = 'queryPermission unavailable'
    }
  }
  const providerInUse = storageProvider.isConnected()
    ? 'folder'
    : storageProvider.isUsingFallback()
      ? 'in-app (explicit session choice)'
      : 'not selected'

  console.info('[liber:diagnostics]', {
    browser: browserName(navigator.userAgent),
    supportsShowDirectoryPicker:
      support.pickerPropertyPresent && support.pickerCallable,
    storageProvider: providerInUse,
    permissionState,
    persistedHandlePresent: Boolean(handle),
  })
}

declare global {
  interface Window {
    __liberDiagnostics?: () => Promise<void>
  }
}

export function installStorageDiagnostics() {
  window.__liberDiagnostics = logStorageDiagnostics
  return () => {
    delete window.__liberDiagnostics
  }
}

function requireFolderAccess() {
  const support = getFolderAccessAssessment()
  if (!support.supported) {
    throw new TypeError(`Folder access is not available: ${support.reason}.`)
  }
  return support
}

export function showLibraryDirectoryPicker() {
  requireFolderAccess()
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

export function showImportDirectoryPicker() {
  requireFolderAccess()
  const picker = (
    window as Window & {
      showDirectoryPicker?: (options?: {
        mode?: 'read' | 'readwrite'
        startIn?: 'documents'
      }) => Promise<FileSystemDirectoryHandle>
    }
  ).showDirectoryPicker
  if (!picker) throw new TypeError('Folder picker is not available.')
  return picker.call(window, { mode: 'read', startIn: 'documents' })
}