import { db } from '../../data/database.ts'
import type { DatabaseProgress } from '../../data/database.ts'
import { parseEpubFile } from '../../data/epubParser.ts'
import type { ParsedEpub } from '../../data/epubParser.ts'
import { defaultSettings } from '../theme.tsx'
import type {
  EpubImportHandler,
  EpubImportRequest,
  LibraryScanResult,
  StorageBackup,
  StorageProvider,
  StorageStatus,
} from './types.ts'
import {
  calculateLibraryDiff,
  resolveApplicationDirectory,
} from './storageUtils.ts'

export const APP_DIRECTORY_NAME = 'liber'
const STORAGE_HANDLE_ID = 'app-root'
const DOCUMENT_SCHEMA_VERSION = 1
const WRITE_DEBOUNCE_MS = 80

type IndexedEpub = {
  size: number
  lastModified: number
  sha256: string | null
  bookFolderName: string
  title: string
  author: string
  seriesName: string | null
  volumeNumber: number | null
  volumeTitle: string
  spineIndex: ParsedEpub['spineIndex']
  toc: ParsedEpub['toc']
  coverPath: string | null
}

type SettingsDocument = {
  schemaVersion: number
  settings: unknown
}

type ProgressDocument = {
  schemaVersion: number
  progress: unknown
}

type LibraryIndexDocument = {
  schemaVersion: number
  entries: Record<string, IndexedEpub>
}

type PendingWrite = {
  value: unknown
  mergeProgress: boolean
  timer: ReturnType<typeof setTimeout>
  waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>
}

type PermissionDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>
}

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite'
  }) => Promise<FileSystemDirectoryHandle>
}

type DirectoryEntry = {
  file: File
  relativePath: string
  bookFolderName: string
}

type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isProgress(value: unknown): value is DatabaseProgress {
  return (
    isRecord(value) &&
    typeof value.stableKey === 'string' &&
    typeof value.volumeId === 'string' &&
    typeof value.bookId === 'string' &&
    typeof value.percent === 'number' &&
    typeof value.updatedAt === 'string' &&
    isRecord(value.position)
  )
}

function missingEntry(error: unknown) {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

function getLockManager(): LockManagerLike | undefined {
  return (navigator as Navigator & { locks?: LockManagerLike }).locks
}

function normalizeSettings(value: unknown) {
  return {
    ...defaultSettings,
    ...(isRecord(value) ? value : {}),
  }
}

function migrateSettingsDocument(value: unknown): SettingsDocument {
  if (!isRecord(value)) throw new Error('Settings file is not a JSON object.')
  const version = typeof value.schemaVersion === 'number' ? value.schemaVersion : 0
  if (version > DOCUMENT_SCHEMA_VERSION) {
    throw new Error('Settings file was created by a newer app version.')
  }
  if (version === 0) {
    return {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      settings: normalizeSettings(value.settings ?? value),
    }
  }
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    settings: normalizeSettings(value.settings),
  }
}

function migrateProgressDocument(value: unknown): ProgressDocument {
  if (Array.isArray(value)) {
    return { schemaVersion: DOCUMENT_SCHEMA_VERSION, progress: value }
  }
  if (!isRecord(value)) throw new Error('Progress file is not a JSON object.')
  const version = typeof value.schemaVersion === 'number' ? value.schemaVersion : 0
  if (version > DOCUMENT_SCHEMA_VERSION) {
    throw new Error('Progress file was created by a newer app version.')
  }
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    progress: Array.isArray(value.progress) ? value.progress : [],
  }
}

function migrateIndexDocument(value: unknown): LibraryIndexDocument {
  if (!isRecord(value)) throw new Error('Library index is not a JSON object.')
  const version = typeof value.schemaVersion === 'number' ? value.schemaVersion : 0
  if (version > DOCUMENT_SCHEMA_VERSION) {
    throw new Error('Library index was created by a newer app version.')
  }
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    entries: isRecord(value.entries)
      ? (value.entries as Record<string, IndexedEpub>)
      : {},
  }
}

function naturalCompare(first: string, second: string) {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function safePath(path: string) {
  const parts = path.split('/').filter(Boolean)
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid library path.')
  }
  return parts
}

function toParsedEpub(entry: IndexedEpub, cover: Blob | null): ParsedEpub {
  return {
    hash: entry.sha256,
    title: entry.title,
    author: entry.author,
    seriesName: entry.seriesName,
    volumeNumber: entry.volumeNumber,
    volumeTitle: entry.volumeTitle,
    cover,
    spineIndex: entry.spineIndex,
    toc: entry.toc,
  }
}

export class FolderStorageProvider implements StorageProvider {
  private status: StorageStatus = 'not-configured'
  private selectedDirectory: FileSystemDirectoryHandle | null = null
  private applicationDirectory: FileSystemDirectoryHandle | null = null
  private dataDirectory: FileSystemDirectoryHandle | null = null
  private libraryDirectory: FileSystemDirectoryHandle | null = null
  private importEpub: EpubImportHandler | null = null
  private initPromise: Promise<void> | null = null
  private scanPromise: Promise<LibraryScanResult> | null = null
  private readonly pendingWrites = new Map<string, PendingWrite>()

  setImporter(importer: EpubImportHandler) {
    this.importEpub = importer
  }

  async init() {
    if (this.initPromise) return this.initPromise
    this.initPromise = this.initialize()
    try {
      await this.initPromise
    } catch (error) {
      this.initPromise = null
      throw error
    }
  }

  private async initialize() {
    if (!this.isSupported()) {
      this.status = 'unsupported'
      return
    }

    const stored = await db.directories.get(STORAGE_HANDLE_ID)
    if (!stored) {
      this.status = 'not-configured'
      return
    }

    const handle = stored.handle as PermissionDirectoryHandle
    this.selectedDirectory = handle
    try {
      const permission = handle.queryPermission
        ? await handle.queryPermission({ mode: 'readwrite' })
        : 'granted'
      if (permission !== 'granted') {
        this.status = 'needs-permission'
        return
      }
      const appDirectory = await resolveApplicationDirectory(
        handle,
        APP_DIRECTORY_NAME,
        false,
      )
      await this.attachExistingDirectory(appDirectory)
      await this.loadCanonicalData()
      this.status = 'connected'
    } catch (error) {
      if (missingEntry(error)) {
        this.status = 'folder-missing'
        return
      }
      throw error
    }
  }

  isConnected() {
    return this.status === 'connected'
  }

  getStatus() {
    return this.status
  }

  getFolderName() {
    return this.selectedDirectory?.name ?? null
  }

  async connect(selectedDirectory: FileSystemDirectoryHandle) {
    if (!this.isSupported()) {
      this.status = 'unsupported'
      return this.status
    }

    const selected = selectedDirectory as PermissionDirectoryHandle
    const permission = selected.requestPermission
      ? await selected.requestPermission({ mode: 'readwrite' })
      : selected.queryPermission
        ? await selected.queryPermission({ mode: 'readwrite' })
        : 'granted'
    if (permission !== 'granted') {
      this.status = 'needs-permission'
      return this.status
    }

    const appDirectory = await resolveApplicationDirectory(
      selectedDirectory,
      APP_DIRECTORY_NAME,
    )
    const dataDirectory = await appDirectory.getDirectoryHandle('data', {
      create: true,
    })
    const libraryDirectory = await appDirectory.getDirectoryHandle('library', {
      create: true,
    })
    await dataDirectory.getDirectoryHandle('covers', { create: true })

    this.selectedDirectory = selectedDirectory
    this.applicationDirectory = appDirectory
    this.dataDirectory = dataDirectory
    this.libraryDirectory = libraryDirectory
    this.status = 'connected'

    await db.directories.put({
      id: STORAGE_HANDLE_ID,
      name: selectedDirectory.name,
      handle: selectedDirectory,
      lastScannedAt: null,
    })
    await this.initializeCanonicalFiles()
    await this.loadCanonicalData()
    await this.listLibrary()
    return this.status
  }

  async reconnect() {
    if (!this.isSupported()) {
      this.status = 'unsupported'
      return this.status
    }
    if (!this.selectedDirectory) {
      const stored = await db.directories.get(STORAGE_HANDLE_ID)
      this.selectedDirectory = stored?.handle ?? null
    }
    if (!this.selectedDirectory) {
      this.status = 'folder-missing'
      return this.status
    }

    const handle = this.selectedDirectory as PermissionDirectoryHandle
    const permission = handle.requestPermission
      ? await handle.requestPermission({ mode: 'readwrite' })
      : handle.queryPermission
        ? await handle.queryPermission({ mode: 'readwrite' })
        : 'granted'
    if (permission !== 'granted') {
      this.status = 'needs-permission'
      return this.status
    }

    try {
      const appDirectory = await resolveApplicationDirectory(
        this.selectedDirectory,
        APP_DIRECTORY_NAME,
        false,
      )
      await this.attachExistingDirectory(appDirectory)
      await this.loadCanonicalData()
      this.status = 'connected'
      await this.listLibrary()
    } catch (error) {
      if (missingEntry(error)) {
        this.status = 'folder-missing'
        return this.status
      }
      throw error
    }
    return this.status
  }

  private isSupported() {
    return (
      typeof window !== 'undefined' &&
      typeof (window as DirectoryPickerWindow).showDirectoryPicker === 'function'
    )
  }

  private async attachExistingDirectory(
    appDirectory: FileSystemDirectoryHandle,
  ) {
    const dataDirectory = await appDirectory.getDirectoryHandle('data', {
      create: false,
    })
    const libraryDirectory = await appDirectory.getDirectoryHandle('library', {
      create: false,
    })
    await dataDirectory.getDirectoryHandle('covers', { create: true })
    this.applicationDirectory = appDirectory
    this.dataDirectory = dataDirectory
    this.libraryDirectory = libraryDirectory
  }

  private assertConnected() {
    if (
      !this.applicationDirectory ||
      !this.dataDirectory ||
      !this.libraryDirectory
    ) {
      throw new Error('Choose a library folder before using folder storage.')
    }
  }

  private async fileHandle(
    directory: FileSystemDirectoryHandle,
    name: string,
    create = false,
  ) {
    return directory.getFileHandle(name, { create })
  }

  private async readJson<T>(name: string): Promise<T | null> {
    this.assertConnected()
    try {
      const handle = await this.fileHandle(this.dataDirectory!, name)
      const file = await handle.getFile()
      return JSON.parse(await file.text()) as T
    } catch (error) {
      if (missingEntry(error)) return null
      throw error
    }
  }

  private scheduleJsonWrite(
    name: string,
    value: unknown,
    mergeProgress = false,
  ) {
    this.assertConnected()
    return new Promise<void>((resolve, reject) => {
      const prior = this.pendingWrites.get(name)
      if (prior) {
        clearTimeout(prior.timer)
        if (prior.mergeProgress && mergeProgress) {
          const priorProgress = isRecord(prior.value) && Array.isArray(prior.value.progress)
            ? prior.value.progress.filter(isProgress)
            : []
          const nextProgress = isRecord(value) && Array.isArray(value.progress)
            ? value.progress.filter(isProgress)
            : []
          const previousRemovals = isRecord(prior.value) && Array.isArray(prior.value.removeStableKeys)
            ? prior.value.removeStableKeys.filter((key): key is string => typeof key === 'string')
            : []
          const nextRemovals = isRecord(value) && Array.isArray(value.removeStableKeys)
            ? value.removeStableKeys.filter((key): key is string => typeof key === 'string')
            : []
          const merged = new Map(
            priorProgress.map((record) => [record.stableKey, record]),
          )
          for (const record of nextProgress) merged.set(record.stableKey, record)
          prior.value = {
            schemaVersion: DOCUMENT_SCHEMA_VERSION,
            progress: [...merged.values()],
            removeStableKeys: [...new Set([...previousRemovals, ...nextRemovals])],
          }
        } else {
          prior.value = value
        }
        prior.mergeProgress = prior.mergeProgress && mergeProgress
        prior.waiters.push({ resolve, reject })
        prior.timer = setTimeout(
          () => void this.flushJsonWrite(name),
          WRITE_DEBOUNCE_MS,
        )
        return
      }

      const pending: PendingWrite = {
        value,
        mergeProgress,
        timer: setTimeout(
          () => void this.flushJsonWrite(name),
          WRITE_DEBOUNCE_MS,
        ),
        waiters: [{ resolve, reject }],
      }
      this.pendingWrites.set(name, pending)
    })
  }

  private async flushJsonWrite(name: string) {
    const pending = this.pendingWrites.get(name)
    if (!pending) return
    this.pendingWrites.delete(name)
    try {
      await this.writeJsonNow(name, pending.value, pending.mergeProgress)
      pending.waiters.forEach((waiter) => waiter.resolve())
    } catch (error) {
      pending.waiters.forEach((waiter) => waiter.reject(error))
    }
  }

  private async writeJsonNow(
    name: string,
    value: unknown,
    mergeProgress = false,
  ) {
    this.assertConnected()
    const write = async () => {
      let document = value
      if (mergeProgress && name === 'progress.json' && isRecord(value)) {
        let current: unknown = null
        try {
          const currentHandle = await this.fileHandle(this.dataDirectory!, name)
          current = JSON.parse(await (await currentHandle.getFile()).text()) as unknown
        } catch (error) {
          if (!missingEntry(error)) throw error
        }
        const existing = current === null
          ? []
          : migrateProgressDocument(current).progress
        const incoming = Array.isArray(value.progress)
          ? value.progress.filter(isProgress)
          : []
        const removals = Array.isArray(value.removeStableKeys)
          ? value.removeStableKeys.filter(
              (key): key is string => typeof key === 'string',
            )
          : []
        const byKey = new Map(
          (Array.isArray(existing) ? existing.filter(isProgress) : []).map(
            (record) => [record.stableKey, record],
          ),
        )
        removals.forEach((key) => byKey.delete(key))
        for (const record of incoming) {
          const previous = byKey.get(record.stableKey)
          if (!previous || record.updatedAt >= previous.updatedAt) {
            byKey.set(record.stableKey, record)
          }
        }
        document = {
          schemaVersion: DOCUMENT_SCHEMA_VERSION,
          progress: [...byKey.values()],
        }
      }
      const handle = await this.fileHandle(this.dataDirectory!, name, true)
      const writable = await handle.createWritable()
      await writable.write(JSON.stringify(document, null, 2))
      await writable.close()
    }
    const locks = getLockManager()
    const lockName = `liber:${this.applicationDirectory!.name}:${name}`
    let lastError: unknown
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        if (locks) await locks.request(lockName, write)
        else await write()
        return
      } catch (error) {
        lastError = error
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 60))
        }
      }
    }
    throw lastError
  }

  private async readIndex() {
    const raw = await this.readJson<unknown>('library-index.json')
    return raw
      ? migrateIndexDocument(raw)
      : { schemaVersion: DOCUMENT_SCHEMA_VERSION, entries: {} }
  }

  private async initializeCanonicalFiles() {
    this.assertConnected()
    const [settings, progress, index] = await Promise.all([
      this.readJson<unknown>('settings.json'),
      this.readJson<unknown>('progress.json'),
      this.readJson<unknown>('library-index.json'),
    ])

    if (settings === null) {
      const current = (await db.settings.get('app'))?.value ?? defaultSettings
      await this.writeJsonNow('settings.json', {
        schemaVersion: DOCUMENT_SCHEMA_VERSION,
        settings: current,
      })
    }
    if (progress === null) {
      await this.writeJsonNow('progress.json', {
        schemaVersion: DOCUMENT_SCHEMA_VERSION,
        progress: await db.progress.toArray(),
      })
    }
    if (index === null) {
      await this.writeJsonNow('library-index.json', {
        schemaVersion: DOCUMENT_SCHEMA_VERSION,
        entries: {},
      })
    }
  }

  private async loadCanonicalData() {
    const [settingsRaw, progressRaw, indexRaw] = await Promise.all([
      this.readJson<unknown>('settings.json'),
      this.readJson<unknown>('progress.json'),
      this.readJson<unknown>('library-index.json'),
    ])
    if (settingsRaw !== null) {
      const migrated = migrateSettingsDocument(settingsRaw)
      if (
        !isRecord(settingsRaw) ||
        settingsRaw.schemaVersion !== DOCUMENT_SCHEMA_VERSION
      ) {
        await this.writeJsonNow('settings.json', migrated)
      }
      await db.settings.put({
        key: 'app',
        value: migrated.settings as StorageBackup['settings'],
        updatedAt: new Date().toISOString(),
      })
    }
    if (progressRaw !== null) {
      const migrated = migrateProgressDocument(progressRaw)
      const progress = Array.isArray(migrated.progress)
        ? migrated.progress.filter(isProgress)
        : []
      if (
        !isRecord(progressRaw) ||
        progressRaw.schemaVersion !== DOCUMENT_SCHEMA_VERSION
      ) {
        await this.writeJsonNow('progress.json', {
          schemaVersion: DOCUMENT_SCHEMA_VERSION,
          progress,
        })
      }
      await db.progress.clear()
      await db.progress.bulkPut(progress)
    }
    const index = await this.readIndex()
    if (!isRecord(indexRaw) || indexRaw.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
      await this.writeJsonNow('library-index.json', index)
    }
  }

  async readSettings() {
    this.assertConnected()
    const raw = await this.readJson<unknown>('settings.json')
    if (raw === null) {
      const settings = (await db.settings.get('app'))?.value ?? defaultSettings
      await this.scheduleJsonWrite('settings.json', {
        schemaVersion: DOCUMENT_SCHEMA_VERSION,
        settings,
      })
      return settings
    }
    const document = migrateSettingsDocument(raw)
    if (!isRecord(raw) || raw.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
      await this.scheduleJsonWrite('settings.json', document)
    }
    return document.settings as StorageBackup['settings']
  }

  async writeSettings(settings: StorageBackup['settings']) {
    await this.scheduleJsonWrite('settings.json', {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      settings,
    })
    await db.settings.put({
      key: 'app',
      value: settings,
      updatedAt: new Date().toISOString(),
    })
  }

  async readProgress() {
    this.assertConnected()
    const progress = await this.readProgressDocument()
    const cached = await db.progress.toArray()
    const normalized = (records: readonly DatabaseProgress[]) =>
      [...records].sort((first, second) =>
        first.stableKey.localeCompare(second.stableKey),
      )
    if (JSON.stringify(normalized(cached)) !== JSON.stringify(normalized(progress))) {
      await db.transaction('rw', db.progress, async () => {
        await db.progress.clear()
        await db.progress.bulkPut(progress)
      })
    }
    return progress
  }

  private async readProgressDocument() {
    const raw = await this.readJson<unknown>('progress.json')
    if (raw === null) {
      const progress = await db.progress.toArray()
      await this.scheduleJsonWrite('progress.json', {
        schemaVersion: DOCUMENT_SCHEMA_VERSION,
        progress,
      })
      return progress
    }
    const document = migrateProgressDocument(raw)
    const progress = Array.isArray(document.progress)
      ? document.progress.filter(isProgress)
      : []
    if (!isRecord(raw) || raw.schemaVersion !== DOCUMENT_SCHEMA_VERSION) {
      await this.scheduleJsonWrite('progress.json', {
        schemaVersion: DOCUMENT_SCHEMA_VERSION,
        progress,
      })
    }
    return progress
  }

  async writeProgress(
    update: DatabaseProgress | readonly DatabaseProgress[],
    options: {
      replace?: boolean
      removeStableKeys?: readonly string[]
    } = {},
  ) {
    const updates = Array.isArray(update) ? update : [update]
    const document = {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      progress: updates,
    }
    if (options.replace) {
      await this.writeJsonNow('progress.json', document)
    } else {
      await this.scheduleJsonWrite(
        'progress.json',
        { ...document, removeStableKeys: options.removeStableKeys ?? [] },
        true,
      )
    }
    await db.transaction('rw', db.progress, async () => {
      if (options.replace) await db.progress.clear()
      if (options.removeStableKeys?.length) {
        await db.progress.bulkDelete([...options.removeStableKeys])
      }
      await db.progress.bulkPut(updates)
    })
  }

  async listLibrary(): Promise<LibraryScanResult> {
    if (this.scanPromise) return this.scanPromise
    this.scanPromise = this.scanLibrary()
    try {
      return await this.scanPromise
    } finally {
      this.scanPromise = null
    }
  }

  private async scanLibrary(): Promise<LibraryScanResult> {
    this.assertConnected()
    const permission = await (this.applicationDirectory as PermissionDirectoryHandle)
      .queryPermission?.({ mode: 'readwrite' })
    if (permission && permission !== 'granted') {
      this.status = 'needs-permission'
      throw new Error('Folder access needs permission. Reconnect the library folder.')
    }

    const document = await this.readIndex()
    const previous = document.entries
    const discovered = await this.discoverEpubs()
    const current: Record<string, IndexedEpub> = {}
    const errors: string[] = []
    const progressBeforeScan = await db.progress.toArray()

    for (const item of discovered) {
      const prior = previous[item.relativePath]
      let indexed: IndexedEpub
      let parsed: ParsedEpub
      try {
        if (
          prior &&
          prior.size === item.file.size &&
          prior.lastModified === item.file.lastModified
        ) {
          indexed = prior
          const cover = prior.coverPath
            ? await this.readCover(prior.coverPath)
            : null
          parsed = toParsedEpub(prior, cover)
        } else {
          parsed = await parseEpubFile(item.file)
          const coverPath = parsed.cover
            ? await this.storeCover(parsed.hash, item.relativePath, parsed.cover)
            : null
          indexed = {
            size: item.file.size,
            lastModified: item.file.lastModified,
            sha256: parsed.hash,
            bookFolderName: item.bookFolderName,
            title: parsed.title,
            author: parsed.author,
            seriesName: parsed.seriesName,
            volumeNumber: parsed.volumeNumber,
            volumeTitle: parsed.volumeTitle,
            spineIndex: parsed.spineIndex,
            toc: parsed.toc,
            coverPath,
          }
        }

        const cachedVolume = await db.volumes
          .where('[sourceDirectoryId+sourceRelativePath]')
          .equals([STORAGE_HANDLE_ID, item.relativePath])
          .first()
        if (
          !cachedVolume ||
          cachedVolume.fileMissing ||
          !prior ||
          prior.size !== item.file.size ||
          prior.lastModified !== item.file.lastModified
        ) {
          if (this.importEpub) {
            const request: EpubImportRequest = {
              file: item.file,
              epub: parsed,
              sourceDirectoryId: STORAGE_HANDLE_ID,
              sourceRelativePath: item.relativePath,
              bookFolderName: item.bookFolderName,
            }
            await this.importEpub(request)
          }
        }
        current[item.relativePath] = indexed
      } catch (error) {
        errors.push(
          `${item.relativePath}: ${error instanceof Error ? error.message : 'Could not read this EPUB.'}`,
        )
        if (prior) current[item.relativePath] = prior
      }
    }

    const diff = calculateLibraryDiff(previous, current)
    await this.markRemovedFiles(diff.removed)
    await this.scheduleJsonWrite('library-index.json', {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      entries: current,
    })
    await db.directories.update(STORAGE_HANDLE_ID, {
      lastScannedAt: new Date().toISOString(),
    })
    const progressAfterScan = await db.progress.toArray()
    if (JSON.stringify(progressBeforeScan) !== JSON.stringify(progressAfterScan)) {
      const currentKeys = new Set(progressAfterScan.map((record) => record.stableKey))
      const removedKeys = progressBeforeScan
        .map((record) => record.stableKey)
        .filter((key) => !currentKeys.has(key))
      await this.writeProgress(progressAfterScan, {
        removeStableKeys: removedKeys,
      })
    }

    const [books, volumes] = await Promise.all([
      db.books.toArray(),
      db.volumes.toArray(),
    ])
    return { books, volumes, diff, errors }
  }

  private async discoverEpubs(): Promise<DirectoryEntry[]> {
    const found: DirectoryEntry[] = []
    for await (const [name, handle] of this.libraryDirectory!.entries()) {
      if (handle.kind === 'directory') {
        for await (const [fileName, child] of handle.entries()) {
          if (child.kind !== 'file' || !fileName.toLowerCase().endsWith('.epub'))
            continue
          found.push({
            file: await child.getFile(),
            relativePath: `${name}/${fileName}`,
            bookFolderName: name,
          })
        }
      } else if (handle.kind === 'file' && name.toLowerCase().endsWith('.epub')) {
        found.push({
          file: await handle.getFile(),
          relativePath: name,
          bookFolderName: name.replace(/\.epub$/i, ''),
        })
      }
    }
    return found.sort((first, second) =>
      naturalCompare(first.relativePath, second.relativePath),
    )
  }

  private async markRemovedFiles(paths: readonly string[]) {
    for (const path of paths) {
      const volume = await db.volumes
        .where('[sourceDirectoryId+sourceRelativePath]')
        .equals([STORAGE_HANDLE_ID, path])
        .first()
      if (!volume) continue
      await db.volumes.update(volume.id, { fileMissing: true })
      const volumes = await db.volumes.where('bookId').equals(volume.bookId).toArray()
      await db.books.update(volume.bookId, {
        missingFile: volumes.some((candidate) => candidate.fileMissing),
      })
    }
  }

  private async readCover(path: string) {
    const parts = safePath(path)
    if (parts.length !== 1) throw new Error('Invalid cover path.')
    try {
      const directory = await this.dataDirectory!.getDirectoryHandle('covers', {
        create: false,
      })
      return await (await directory.getFileHandle(parts[0])).getFile()
    } catch (error) {
      if (missingEntry(error)) return null
      throw error
    }
  }

  private async storeCover(hash: string | null, relativePath: string, cover: Blob) {
    const fileName = `${hash ?? encodeURIComponent(relativePath)}.cover`
    const directory = await this.dataDirectory!.getDirectoryHandle('covers', {
      create: true,
    })
    try {
      await directory.getFileHandle(fileName, { create: false })
      return fileName
    } catch (error) {
      if (!missingEntry(error)) throw error
    }
    const handle = await directory.getFileHandle(fileName, { create: true })
    const writable = await handle.createWritable()
    await writable.write(cover)
    await writable.close()
    return fileName
  }

  async readBookFile(path: string) {
    this.assertConnected()
    const parts = safePath(path)
    if (parts.length === 0) throw new Error('Invalid library path.')
    let directory = this.libraryDirectory!
    for (const part of parts.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(part, { create: false })
    }
    const handle = await directory.getFileHandle(parts[parts.length - 1], {
      create: false,
    })
    return handle.getFile()
  }

  async copyIntoLibrary(files: readonly File[], bookFolderName: string) {
    this.assertConnected()
    if (!this.importEpub) throw new Error('The EPUB importer is unavailable.')
    const safeFolder = bookFolderName.trim()
    if (!safeFolder || safeFolder === '.' || safeFolder === '..' || safeFolder.includes('/')) {
      throw new Error('Choose a valid book folder name.')
    }
    if (files.some((file) => !file.name.toLowerCase().endsWith('.epub') || !file.size)) {
      throw new Error('Only non-empty EPUB files can be copied into the library.')
    }
    const names = files.map((file) => file.name)
    if (new Set(names).size !== names.length) {
      throw new Error('The selected files contain duplicate names.')
    }

    const folder = await this.libraryDirectory!.getDirectoryHandle(safeFolder, {
      create: true,
    })
    for (const file of files) {
      try {
        await folder.getFileHandle(file.name, { create: false })
        throw new Error(`A file named ${file.name} already exists in this book folder.`)
      } catch (error) {
        if (!missingEntry(error)) throw error
      }
    }

    const copiedPaths: string[] = []
    for (const file of files) {
      const handle = await folder.getFileHandle(file.name, { create: true })
      const writable = await handle.createWritable()
      await writable.write(file)
      await writable.close()
      copiedPaths.push(`${safeFolder}/${file.name}`)
    }
    await this.listLibrary()
    return copiedPaths
  }

  async deleteLibraryFiles(
    paths: readonly string[],
    options: { confirmed: true },
  ) {
    this.assertConnected()
    if (!options.confirmed) throw new Error('Deleting library files requires confirmation.')
    for (const path of paths) {
      const parts = safePath(path)
      if (parts.length === 0) continue
      let directory = this.libraryDirectory!
      for (const part of parts.slice(0, -1)) {
        directory = await directory.getDirectoryHandle(part, { create: false })
      }
      try {
        await directory.removeEntry(parts[parts.length - 1])
      } catch (error) {
        if (!missingEntry(error)) throw error
      }
    }
    await this.listLibrary()
  }

  async exportData() {
    const backup: StorageBackup = {
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      settings: await this.readSettings(),
      progress: await this.readProgress(),
    }
    return new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json',
    })
  }

  async importData(data: Blob, options: { replaceExisting?: boolean } = {}) {
    let parsed: unknown
    try {
      parsed = JSON.parse(await data.text()) as unknown
    } catch {
      throw new Error('This backup is not valid JSON.')
    }
    if (
      !isRecord(parsed) ||
      parsed.schemaVersion !== DOCUMENT_SCHEMA_VERSION ||
      !isRecord(parsed.settings) ||
      !Array.isArray(parsed.progress) ||
      !parsed.progress.every(isProgress)
    ) {
      throw new Error('This backup uses an unsupported format.')
    }
    if (!options.replaceExisting) {
      const [settings, progress] = await Promise.all([
        this.readJson<unknown>('settings.json'),
        this.readProgress(),
      ])
      if (settings !== null || progress.length > 0) {
        throw new Error('Replacing folder data requires confirmation.')
      }
    }
    await this.writeSettings(normalizeSettings(parsed.settings))
    await this.writeProgress(parsed.progress, { replace: true })
  }
}
