import { db } from '../../data/database.ts'
import { parseEpubFile } from '../../data/epubParser.ts'
import type {
  DatabaseBook,
  DatabaseProgress,
  DatabaseVolume,
} from '../../data/database.ts'
import { defaultSettings } from '../theme.tsx'
import type {
  EpubImportHandler,
  LibraryScanResult,
  StorageBackup,
  StorageProvider,
} from './types.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isProgress(value: unknown): value is DatabaseProgress {
  if (!isRecord(value)) return false
  return (
    typeof value.stableKey === 'string' &&
    typeof value.volumeId === 'string' &&
    typeof value.bookId === 'string' &&
    typeof value.percent === 'number' &&
    typeof value.updatedAt === 'string' &&
    isRecord(value.position)
  )
}

export class FallbackStorageProvider implements StorageProvider {
  private importEpub: EpubImportHandler | null = null

  setImporter(importer: EpubImportHandler) {
    this.importEpub = importer
  }

  async init() {}

  isConnected() {
    return true
  }

  async connect() {
    return 'unsupported' as const
  }

  getStatus() {
    return 'unsupported' as const
  }

  async readSettings() {
    return (await db.settings.get('app'))?.value ?? defaultSettings
  }

  async writeSettings(settings: StorageBackup['settings']) {
    await db.settings.put({
      key: 'app',
      value: settings,
      updatedAt: new Date().toISOString(),
    })
  }

  readProgress() {
    return db.progress.toArray()
  }

  async writeProgress(
    progress: DatabaseProgress | readonly DatabaseProgress[],
    options: {
      replace?: boolean
      removeStableKeys?: readonly string[]
    } = {},
  ) {
    const records = Array.isArray(progress) ? progress : [progress]
    await db.transaction('rw', db.progress, async () => {
      if (options.replace) await db.progress.clear()
      if (options.removeStableKeys?.length) {
        await db.progress.bulkDelete([...options.removeStableKeys])
      }
      await db.progress.bulkPut(records)
    })
  }

  async listLibrary(): Promise<LibraryScanResult> {
    const [books, volumes] = await Promise.all([
      db.books.toArray(),
      db.volumes.toArray(),
    ])
    return { books, volumes, diff: { added: [], removed: [], changed: [] }, errors: [] }
  }

  async readBookFile(path: string) {
    const volume =
      (await db.volumes.get(path)) ??
      (await db.volumes
        .filter((record) => record.sourceRelativePath === path)
        .first())
    const fileRecord = await db.files.get(volume?.fileId ?? path)
    if (!fileRecord) {
      throw new Error('This volume file is missing from local storage.')
    }
    const name = volume?.sourceRelativePath?.split('/').at(-1) ?? 'book.epub'
    return new File([fileRecord.blob], name, {
      type: 'application/epub+zip',
      lastModified: Date.now(),
    })
  }

  async copyIntoLibrary(files: readonly File[], bookFolderName: string) {
    if (!this.importEpub) throw new Error('The EPUB importer is unavailable.')
    const paths: string[] = []
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.epub') || file.size === 0) {
        throw new Error(`Choose a non-empty EPUB file: ${file.name}`)
      }
      const epub = await parseEpubFile(file)
      await this.importEpub({ file, epub, bookFolderName })
      paths.push(`${bookFolderName}/${file.name}`)
    }
    return paths
  }

  async deleteLibraryFiles(
    paths: readonly string[],
    options: { confirmed: true },
  ) {
    void paths
    void options
  }

  async exportData() {
    const backup: StorageBackup = {
      schemaVersion: 1,
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
      parsed.schemaVersion !== 1 ||
      !isRecord(parsed.settings) ||
      !Array.isArray(parsed.progress) ||
      !parsed.progress.every(isProgress)
    ) {
      throw new Error('This backup uses an unsupported format.')
    }

    const settings = { ...defaultSettings, ...parsed.settings }
    const progress = parsed.progress
    await db.transaction('rw', db.settings, db.progress, async () => {
      if (!options.replaceExisting) {
        const [settingsRecord, progressCount] = await Promise.all([
          db.settings.get('app'),
          db.progress.count(),
        ])
        if (settingsRecord || progressCount > 0) {
          throw new Error('Replacing local data requires confirmation.')
        }
      }
      await db.settings.put({
        key: 'app',
        value: settings,
        updatedAt: new Date().toISOString(),
      })
      if (options.replaceExisting) await db.progress.clear()
      await db.progress.bulkPut(progress)
    })
  }
}

export type CachedLibraryRecords = {
  books: DatabaseBook[]
  volumes: DatabaseVolume[]
}