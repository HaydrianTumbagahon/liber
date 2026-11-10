import { db } from './database.ts'
import type {
  DatabaseBook,
  DatabaseDirectory,
  DatabaseProgress,
  DatabaseVolume,
  ProgressPosition,
} from './database.ts'
import type { AppSettings } from '../lib/theme.tsx'
import { parseEpubFile } from './epubParser.ts'
import type { ParsedEpub } from './epubParser.ts'
import { mockBooks } from './mockBooks.ts'
import { registerEpubImportHandler, storageProvider } from '../lib/storage/index.ts'

function createId(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.()
  return `${prefix}-${randomId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function normalizeIdentityPart(value: string) {
  return (
    value
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  )
}

function createSeriesKey(title: string, author: string) {
  return normalizeIdentityPart(`${author}:${title}`)
}

export function createStableVolumeKey(
  title: string,
  author: string,
  volumeNumber: number,
  sourceFileHash: string | null,
) {
  if (sourceFileHash) {
    return `sha256:${sourceFileHash.toLowerCase()}:volume:${volumeNumber}`
  }

  return `fallback:${normalizeIdentityPart(title)}:${normalizeIdentityPart(author)}:volume:${volumeNumber}`
}

export async function hashEpub(file: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null

  try {
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      await file.arrayBuffer(),
    )
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  } catch {
    return null
  }
}

export type ImportEpubInput = {
  file: File
  sourceDirectoryId?: string
  sourceRelativePath?: string
  bookFolderName?: string
}

export type ImportEpubResult = {
  bookId: string
  title: string
  volumeNumber: number
  outcome: 'added' | 'relinked' | 'already-present'
}

export type DirectoryImportFileResult = {
  name: string
  outcome: ImportEpubResult['outcome'] | null
  errorMessage: string | null
}

export type DirectoryImportResult = {
  files: DirectoryImportFileResult[]
  permissionDenied: boolean
  foundPaths: string[]
  scanComplete: boolean
}

export type LibraryResyncResult = {
  scanned: number
  added: number
  removed?: number
  relinked: number
  verified: number
  missing: number
  errors: number
  permissionDenied: number
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    }
    return entities[character]
  })
}

function createFallbackCover(title: string) {
  const words = title.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (candidate.length > 19 && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  if (lines.length > 5) {
    lines.splice(5)
    lines[4] = `${lines[4].slice(0, 16)}...`
  }

  const titleLines = lines
    .map(
      (lineText, index) =>
        `<text x="64" y="${535 + index * 52}" font-family="system-ui,sans-serif" font-size="38" font-weight="500">${escapeXml(lineText)}</text>`,
    )
    .join('')
  return new Blob(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900"><rect width="600" height="900" fill="#fff"/><path d="M64 100h472" stroke="#000" stroke-width="2"/><path d="M64 132h112" stroke="#00685e" stroke-width="8"/><text x="64" y="468" font-family="system-ui,sans-serif" font-size="18" fill="#595959">LIGHT NOVEL</text><g fill="#000">${titleLines}</g><path d="M64 820h472" stroke="#000" stroke-width="2"/><text x="64" y="858" font-family="system-ui,sans-serif" font-size="16" fill="#595959">LIBER</text></svg>`,
    ],
    { type: 'image/svg+xml' },
  )
}

function nextAvailableVolumeNumber(volumes: readonly DatabaseVolume[]) {
  const occupied = new Set(volumes.map((volume) => volume.number))
  let number = 1
  while (occupied.has(number)) number += 1
  return number
}

export async function importEpubFile({
  file,
  ...source
}: ImportEpubInput): Promise<ImportEpubResult> {
  const epub = await parseEpubFile(file)
  return importParsedEpubFile({ file, epub, ...source })
}

export async function importParsedEpubFile({
  file,
  epub,
  sourceDirectoryId,
  sourceRelativePath,
  bookFolderName,
}: ImportEpubInput & { epub: ParsedEpub }): Promise<ImportEpubResult> {
  const sourceFileHash = epub.hash
  const title = bookFolderName?.trim() || epub.seriesName?.trim() || epub.title
  const author = epub.author
  const seriesKey = createSeriesKey(title, author)
  const now = new Date().toISOString()
  const cacheEpubBlob =
    !(sourceDirectoryId === 'app-root' && storageProvider.isConnected())

  return db.transaction(
    'rw',
    db.books,
    db.volumes,
    db.files,
    db.covers,
    db.progress,
    async () => {
      const hashMatch = sourceFileHash
        ? await db.volumes
            .where('sourceFileHash')
            .equals(sourceFileHash)
            .first()
        : undefined
      const directoryMatch =
        sourceDirectoryId && sourceRelativePath
          ? await db.volumes
              .where('[sourceDirectoryId+sourceRelativePath]')
              .equals([sourceDirectoryId, sourceRelativePath])
              .first()
          : undefined
      let existingVolume = hashMatch ?? directoryMatch
      const matchedSeries = await db.books
        .where('seriesKey')
        .equals(seriesKey)
        .first()
      const existingBook = existingVolume
        ? await db.books.get(existingVolume.bookId)
        : matchedSeries
      const bookId = existingBook?.id ?? createId('book')
      const volumeId = existingVolume?.id ?? createId('volume')
      const relatedVolumes = await db.volumes
        .where('bookId')
        .equals(bookId)
        .toArray()
      if (!sourceFileHash && !existingVolume) {
        const fallbackPrefix = `fallback:${normalizeIdentityPart(title)}:${normalizeIdentityPart(author)}:volume:`
        existingVolume = relatedVolumes.find(
          (volume) =>
            volume.stableKey.startsWith(fallbackPrefix) &&
            (epub.volumeNumber === null || volume.number === epub.volumeNumber),
        )
      }
      const requestedNumber =
        existingVolume?.number ??
        epub.volumeNumber ??
        nextAvailableVolumeNumber(relatedVolumes)
      const numberConflict = relatedVolumes.some(
        (volume) =>
          volume.number === requestedNumber && volume.id !== existingVolume?.id,
      )
      const volumeNumber =
        existingVolume?.number ??
        (numberConflict
          ? nextAvailableVolumeNumber(relatedVolumes)
          : requestedNumber)
      const stableKey =
        sourceFileHash && existingVolume?.sourceFileHash !== sourceFileHash
          ? createStableVolumeKey(title, author, volumeNumber, sourceFileHash)
          : (existingVolume?.stableKey ??
            createStableVolumeKey(title, author, volumeNumber, sourceFileHash))
      const fileId = cacheEpubBlob
        ? sourceFileHash
          ? `sha256:${sourceFileHash}`
          : (existingVolume?.fileId ?? createId('file'))
        : null
      const previousFileId = existingVolume?.fileId
      const previousStableKey = existingVolume?.stableKey
      const existingFile = previousFileId
        ? await db.files.get(previousFileId)
        : undefined
      const alreadyPresent = Boolean(
        existingVolume &&
        !existingVolume.fileMissing &&
        existingVolume.fileId === fileId &&
        existingFile &&
        existingFile.size === file.size &&
        existingVolume.sourceFileHash === sourceFileHash,
      )

      if (cacheEpubBlob && fileId) {
        await db.files.put({
          id: fileId,
          blob: file,
          size: file.size,
          sha256: sourceFileHash,
        })
      }
      await db.volumes.put({
        id: volumeId,
        stableKey,
        bookId,
        number: volumeNumber,
        title: epub.volumeTitle,
        spineIndex: epub.spineIndex,
        toc: epub.toc,
        sourceFileHash,
        fileId,
        fileMissing: false,
        sourceDirectoryId:
          sourceDirectoryId ?? existingVolume?.sourceDirectoryId,
        sourceRelativePath:
          sourceRelativePath ?? existingVolume?.sourceRelativePath,
      })

      const priorCover = existingBook?.coverBlobId
        ? await db.covers.get(existingBook.coverBlobId)
        : undefined
      const shouldUseVolumeCover =
        !existingBook?.coverBlobId ||
        (volumeNumber === 1 && priorCover?.kind === 'generated')
      let coverBlobId = existingBook?.coverBlobId ?? null
      if (shouldUseVolumeCover) {
        const coverId = createId('cover')
        const useEpubCover = volumeNumber === 1 && epub.cover !== null
        const coverBlob =
          useEpubCover && epub.cover ? epub.cover : createFallbackCover(title)
        await db.covers.put({
          id: coverId,
          blob: coverBlob,
          size: coverBlob.size,
          kind: useEpubCover ? 'epub' : 'generated',
        })
        coverBlobId = coverId
      }

      const updatedVolumes = await db.volumes
        .where('bookId')
        .equals(bookId)
        .toArray()
      const book: DatabaseBook = {
        id: bookId,
        title: bookFolderName?.trim() || existingBook?.title || title,
        author: existingBook?.author ?? author,
        seriesKey: bookFolderName?.trim()
          ? seriesKey
          : (existingBook?.seriesKey ?? seriesKey),
        coverBlobId,
        dateAdded: existingBook?.dateAdded ?? now,
        dateModified: now,
        lastRead: existingBook?.lastRead ?? null,
        sourceInfo: { kind: 'epub', fileName: file.name, sourceFileHash },
        missingFile: updatedVolumes.some((volume) => volume.fileMissing),
      }
      await db.books.put(book)

      const oldProgress =
        previousStableKey && previousStableKey !== stableKey
          ? await db.progress.get(previousStableKey)
          : undefined
      if (oldProgress && previousStableKey) {
        const newProgress = await db.progress.get(stableKey)
        if (!newProgress) {
          await db.progress.put({
            ...oldProgress,
            stableKey,
            bookId,
            volumeId,
          })
        }
        await db.progress.delete(previousStableKey)
      }

      const progress = await db.progress.get(stableKey)
      if (progress) {
        await db.progress.put({ ...progress, bookId, volumeId })
      }

      if (previousFileId && previousFileId !== fileId) {
        const stillUsed = await db.volumes
          .where('fileId')
          .equals(previousFileId)
          .count()
        if (stillUsed === 0) await db.files.delete(previousFileId)
      }

      if (
        priorCover &&
        coverBlobId !== existingBook?.coverBlobId &&
        existingBook?.coverBlobId
      ) {
        const stillUsed = await db.books
          .where('coverBlobId')
          .equals(existingBook.coverBlobId)
          .count()
        if (stillUsed === 0) await db.covers.delete(existingBook.coverBlobId)
      }

      return {
        bookId,
        volumeId,
        title: book.title,
        volumeNumber,
        outcome: alreadyPresent
          ? 'already-present'
          : existingVolume
            ? 'relinked'
            : 'added',
      }
    },
  )
}

registerEpubImportHandler((request) => importParsedEpubFile(request))

type DirectoryFile = {
  file: File
  relativePath: string
}

type PermissionDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>
  requestPermission?: (descriptor: { mode: 'read' }) => Promise<PermissionState>
}

async function requestDirectoryReadPermission(
  handle: FileSystemDirectoryHandle,
) {
  const permissionHandle = handle as PermissionDirectoryHandle
  if (!permissionHandle.queryPermission) return true

  const descriptor = { mode: 'read' as const }
  const permission = await permissionHandle.queryPermission(descriptor)
  if (permission === 'granted') return true
  if (!permissionHandle.requestPermission) return false
  return (await permissionHandle.requestPermission(descriptor)) === 'granted'
}

async function listDirectoryEpubs(
  directory: FileSystemDirectoryHandle,
  parentPath = '',
): Promise<DirectoryFile[]> {
  const files: DirectoryFile[] = []
  for await (const [name, entry] of directory.entries()) {
    const relativePath = parentPath ? `${parentPath}/${name}` : name
    if (entry.kind === 'directory') {
      files.push(...(await listDirectoryEpubs(entry, relativePath)))
    } else if (name.toLowerCase().endsWith('.epub')) {
      files.push({ file: await entry.getFile(), relativePath })
    }
  }
  return files
}

async function scanAndImportDirectory(
  directory: DatabaseDirectory,
): Promise<DirectoryImportResult> {
  try {
    if (!(await requestDirectoryReadPermission(directory.handle))) {
      return {
        files: [],
        permissionDenied: true,
        foundPaths: [],
        scanComplete: false,
      }
    }
    const epubFiles = await listDirectoryEpubs(directory.handle)
    const files: DirectoryImportFileResult[] = []
    for (const { file, relativePath } of epubFiles) {
      try {
        const result = await importEpubFile({
          file,
          sourceDirectoryId: directory.id,
          sourceRelativePath: relativePath,
        })
        files.push({
          name: relativePath,
          outcome: result.outcome,
          errorMessage: null,
        })
      } catch (error) {
        files.push({
          name: relativePath,
          outcome: null,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Could not import this EPUB.',
        })
      }
    }
    await db.directories.update(directory.id, {
      lastScannedAt: new Date().toISOString(),
    })
    return {
      files,
      permissionDenied: false,
      foundPaths: epubFiles.map((file) => file.relativePath),
      scanComplete: true,
    }
  } catch (error) {
    return {
      files: [
        {
          name: directory.name,
          outcome: null,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Could not read the selected folder.',
        },
      ],
      permissionDenied: false,
      foundPaths: [],
      scanComplete: false,
    }
  }
}

async function markMissingDirectoryPaths(
  directoryId: string,
  foundPaths: readonly string[],
) {
  const found = new Set(foundPaths)
  const trackedVolumes = await db.volumes
    .filter((volume) => volume.sourceDirectoryId === directoryId)
    .toArray()
  const affectedBookIds = new Set<string>()

  for (const volume of trackedVolumes) {
    if (!volume.sourceRelativePath || found.has(volume.sourceRelativePath)) {
      continue
    }
    await db.volumes.update(volume.id, { fileMissing: true })
    affectedBookIds.add(volume.bookId)
  }

  for (const bookId of affectedBookIds) {
    const volumes = await db.volumes.where('bookId').equals(bookId).toArray()
    await db.books.update(bookId, {
      missingFile: volumes.some((volume) => volume.fileMissing),
    })
  }
}

export async function importEpubDirectory(
  handle: FileSystemDirectoryHandle,
): Promise<DirectoryImportResult> {
  const directory: DatabaseDirectory = {
    id: 'primary',
    name: handle.name,
    handle,
    lastScannedAt: null,
  }
  await db.directories.put(directory)
  const result = await scanAndImportDirectory(directory)
  if (result.scanComplete) {
    await markMissingDirectoryPaths(directory.id, result.foundPaths)
  }
  return result
}

async function verifyStoredSourceBlobs() {
  const files = await db.files.toArray()
  const validFileIds = new Set<string>()
  const invalidFileIds = new Set<string>()

  for (const file of files) {
    const hash = await hashEpub(file.blob)
    const valid =
      file.blob.size === file.size &&
      (!file.sha256 || !hash || hash === file.sha256)
    if (valid) validFileIds.add(file.id)
    else invalidFileIds.add(file.id)
  }

  await db.transaction('rw', db.books, db.volumes, db.files, async () => {
    const volumes = await db.volumes.toArray()
    for (const volume of volumes) {
      if (!volume.fileId) continue
      const valid = validFileIds.has(volume.fileId)
      await db.volumes.update(volume.id, {
        fileId: valid ? volume.fileId : null,
        fileMissing: !valid,
      })
    }

    for (const fileId of invalidFileIds) {
      await db.files.delete(fileId)
    }

    const books = await db.books.toArray()
    for (const book of books) {
      const volumesForBook = await db.volumes
        .where('bookId')
        .equals(book.id)
        .toArray()
      await db.books.update(book.id, {
        missingFile: volumesForBook.some((volume) => volume.fileMissing),
      })
    }
  })

  return validFileIds.size
}

export async function resyncLibrary(): Promise<LibraryResyncResult> {
  await storageProvider.init()
  if (storageProvider.isConnected()) {
    const previousBookIds = new Set(
      (await db.books.toArray()).map((book) => book.id),
    )
    const result = await storageProvider.listLibrary()
    const missing = result.books.filter((book) => book.missingFile).length
    return {
      scanned: result.volumes.length,
      added: result.books.filter((book) => !previousBookIds.has(book.id)).length,
      removed: result.diff.removed.length,
      relinked: result.diff.changed.length,
      verified: Math.max(
        0,
        result.volumes.length - result.diff.added.length - result.diff.changed.length,
      ),
      missing,
      errors: result.errors.length,
      permissionDenied: 0,
    }
  }

  const verified = await verifyStoredSourceBlobs()
  const directory = await db.directories.get('primary')
  let scanned = 0
  let added = 0
  let relinked = 0
  let errors = 0
  let permissionDenied = 0

  if (directory) {
    const result = await scanAndImportDirectory(directory)
    if (result.scanComplete) {
      await markMissingDirectoryPaths(directory.id, result.foundPaths)
    }
    permissionDenied += Number(result.permissionDenied)
    for (const file of result.files) {
      if (file.errorMessage) {
        errors += 1
      } else {
        scanned += 1
        if (file.outcome === 'added') added += 1
        if (file.outcome === 'relinked') relinked += 1
      }
    }
  }

  const [books, volumes] = await Promise.all([
    db.books.toArray(),
    db.volumes.toArray(),
  ])
  const volumesByBook = new Map<string, DatabaseVolume[]>()
  for (const volume of volumes) {
    const grouped = volumesByBook.get(volume.bookId) ?? []
    grouped.push(volume)
    volumesByBook.set(volume.bookId, grouped)
  }
  await Promise.all(
    books.map((book) =>
      db.books.update(book.id, {
        missingFile: (volumesByBook.get(book.id) ?? []).some(
          (volume) => volume.fileMissing,
        ),
      }),
    ),
  )

  return {
    scanned,
    added,
    relinked,
    verified,
    missing: volumes.filter((volume) => volume.fileMissing).length,
    errors,
    permissionDenied,
  }
}

export async function saveCoverForBooks(
  bookIds: readonly string[],
  file: File,
) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.')
  }

  return db.transaction('rw', db.books, db.covers, async () => {
    const coverId = createId('cover')
    await db.covers.put({
      id: coverId,
      blob: file,
      size: file.size,
      kind: 'custom',
    })

    const previousCoverIds = new Set<string>()
    for (const bookId of bookIds) {
      const book = await db.books.get(bookId)
      if (!book) continue
      if (book.coverBlobId) previousCoverIds.add(book.coverBlobId)
      await db.books.update(bookId, {
        coverBlobId: coverId,
        dateModified: new Date().toISOString(),
      })
    }

    for (const previousId of previousCoverIds) {
      const stillUsed = await db.books
        .where('coverBlobId')
        .equals(previousId)
        .count()
      if (stillUsed === 0) await db.covers.delete(previousId)
    }

    return coverId
  })
}

export async function deleteBooks(bookIds: readonly string[]) {
  const ids = [...new Set(bookIds)]
  await storageProvider.init()
  const deletedVolumes = await db.volumes
    .filter((volume) => ids.includes(volume.bookId))
    .toArray()
  const deletedProgressKeys = deletedVolumes.map((volume) => volume.stableKey)
  if (storageProvider.isConnected()) {
    await storageProvider.deleteLibraryFiles(
      deletedVolumes.flatMap((volume) =>
        volume.sourceDirectoryId === 'app-root' && volume.sourceRelativePath
          ? [volume.sourceRelativePath]
          : [],
      ),
      { confirmed: true },
    )
  }

  await db.transaction(
    'rw',
    db.books,
    db.volumes,
    db.files,
    db.covers,
    db.progress,
    async () => {
      const candidateFileIds = new Set<string>()
      const candidateCoverIds = new Set<string>()

      for (const bookId of ids) {
        const [book, volumes] = await Promise.all([
          db.books.get(bookId),
          db.volumes.where('bookId').equals(bookId).toArray(),
        ])

        if (book?.coverBlobId) candidateCoverIds.add(book.coverBlobId)
        volumes.forEach((volume) => {
          if (volume.fileId) candidateFileIds.add(volume.fileId)
        })
        await db.progress.bulkDelete(volumes.map((volume) => volume.stableKey))
        await db.volumes.where('bookId').equals(bookId).delete()
        await db.books.delete(bookId)
      }

      for (const fileId of candidateFileIds) {
        const stillUsed = await db.volumes
          .where('fileId')
          .equals(fileId)
          .count()
        if (stillUsed === 0) await db.files.delete(fileId)
      }

      for (const coverId of candidateCoverIds) {
        const stillUsed = await db.books
          .where('coverBlobId')
          .equals(coverId)
          .count()
        if (stillUsed === 0) await db.covers.delete(coverId)
      }
    },
  )
  await storageProvider.writeProgress([], {
    removeStableKeys: deletedProgressKeys,
  })
}

export async function groupBooksIntoSeries(
  bookIds: readonly string[],
  seriesTitle: string,
) {
  const ids = [...new Set(bookIds)]
  const title = seriesTitle.trim()
  if (ids.length < 2 || !title) {
    throw new Error('Select at least two books and enter a series title.')
  }

  const groupedBookId = await db.transaction(
    'rw',
    db.books,
    db.volumes,
    db.progress,
    db.covers,
    async () => {
      const books = (
        await Promise.all(ids.map((id) => db.books.get(id)))
      ).filter((book): book is DatabaseBook => Boolean(book))
      if (books.length < 2) throw new Error('Select at least two books.')

      const [target, ...sources] = books
      const targetVolumes = await db.volumes
        .where('bookId')
        .equals(target.id)
        .toArray()
      const occupied = new Set(targetVolumes.map((volume) => volume.number))
      let nextNumber = Math.max(0, ...occupied) + 1
      const oldCoverIds = new Set(
        sources.flatMap((book) => (book.coverBlobId ? [book.coverBlobId] : [])),
      )

      for (const source of sources) {
        const sourceVolumes = await db.volumes
          .where('bookId')
          .equals(source.id)
          .sortBy('number')
        for (const volume of sourceVolumes) {
          let number = volume.number
          if (occupied.has(number)) {
            while (occupied.has(nextNumber)) nextNumber += 1
            number = nextNumber
            nextNumber += 1
          }
          occupied.add(number)
          await db.volumes.update(volume.id, { bookId: target.id, number })
          const progress = await db.progress.get(volume.stableKey)
          if (progress) {
            await db.progress.put({ ...progress, bookId: target.id })
          }
        }
      }

      const coverBlobId =
        target.coverBlobId ??
        sources.find((book) => book.coverBlobId)?.coverBlobId ??
        null
      const groupedVolumes = await db.volumes
        .where('bookId')
        .equals(target.id)
        .toArray()
      await db.books.update(target.id, {
        title,
        seriesKey: createSeriesKey(title, target.author),
        coverBlobId,
        dateModified: new Date().toISOString(),
        missingFile: groupedVolumes.some((volume) => volume.fileMissing),
      })
      await db.books.bulkDelete(sources.map((book) => book.id))

      for (const coverId of oldCoverIds) {
        const stillUsed = await db.books
          .where('coverBlobId')
          .equals(coverId)
          .count()
        if (stillUsed === 0) await db.covers.delete(coverId)
      }

      return target.id
    },
  )
  if (storageProvider.isConnected()) {
    await storageProvider.writeProgress(await db.progress.toArray())
  }
  return groupedBookId
}

export async function markBookFileMissing(bookId: string) {
  return db.transaction('rw', db.books, db.volumes, db.files, async () => {
    const volumes = await db.volumes.where('bookId').equals(bookId).toArray()
    const fileIds = new Set(
      volumes.flatMap((volume) => (volume.fileId ? [volume.fileId] : [])),
    )
    await db.books.update(bookId, { missingFile: true })
    await db.volumes.where('bookId').equals(bookId).modify({
      fileId: null,
      fileMissing: true,
    })

    for (const fileId of fileIds) {
      const stillUsed = await db.volumes.where('fileId').equals(fileId).count()
      if (stillUsed === 0) await db.files.delete(fileId)
    }
  })
}

export async function clearCachedFiles() {
  return db.transaction('rw', db.books, db.volumes, db.files, async () => {
    const fileIds = new Set((await db.files.toArray()).map((file) => file.id))
    const affectedBookIds = new Set<string>()
    const affectedVolumes = await db.volumes
      .filter((volume) => volume.fileId !== null && fileIds.has(volume.fileId))
      .toArray()

    for (const volume of affectedVolumes) {
      affectedBookIds.add(volume.bookId)
      await db.volumes.update(volume.id, { fileId: null, fileMissing: true })
    }

    for (const bookId of affectedBookIds) {
      await db.books.update(bookId, { missingFile: true })
    }

    await db.files.clear()
    return affectedBookIds.size
  })
}

export async function saveProgress(
  stableKey: string,
  volumeId: string,
  bookId: string,
  position: ProgressPosition,
  percent: number,
) {
  const progress: DatabaseProgress = {
    stableKey,
    volumeId,
    bookId,
    position,
    percent: Math.min(100, Math.max(0, percent)),
    updatedAt: new Date().toISOString(),
  }

  try {
    await storageProvider.writeProgress(progress)
  } catch (error) {
    const message =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'UnknownError')
        ? 'Storage is full. Clear cache or delete unused books to save progress.'
        : error instanceof Error
          ? error.message
          : 'Progress could not be saved.'
    throw new Error(message, { cause: error })
  }
}

export async function seedMockLibrary() {
  await db.transaction('rw', db.books, db.volumes, db.progress, async () => {
    for (const mockBook of mockBooks) {
      if (await db.books.get(mockBook.id)) continue

      const book: DatabaseBook = {
        id: mockBook.id,
        title: mockBook.title,
        author: mockBook.author,
        seriesKey: createSeriesKey(mockBook.title, mockBook.author),
        coverBlobId: null,
        dateAdded: mockBook.dateAdded,
        dateModified: mockBook.dateModified,
        lastRead: mockBook.lastRead,
        sourceInfo: { kind: 'seed', fileName: null, sourceFileHash: null },
        missingFile: mockBook.missingFile,
      }
      await db.books.add(book)

      for (const volume of mockBook.volumes) {
        const stableKey = createStableVolumeKey(
          mockBook.title,
          mockBook.author,
          volume.number,
          null,
        )
        const volumeId = `${mockBook.id}-volume-${volume.number}`
        await db.volumes.put({
          id: volumeId,
          stableKey,
          bookId: mockBook.id,
          number: volume.number,
          title: volume.title,
          spineIndex: [],
          toc: [],
          sourceFileHash: null,
          fileId: null,
          fileMissing: mockBook.missingFile,
        })
        await db.progress.put({
          stableKey,
          volumeId,
          bookId: mockBook.id,
          position: { scrollOffset: 0 },
          percent: volume.progress,
          updatedAt: mockBook.lastRead ?? mockBook.dateModified,
        })
      }
    }
  })
}

export async function resetDatabase(defaults: AppSettings) {
  await db.transaction(
    'rw',
    [
      db.books,
      db.volumes,
      db.files,
      db.covers,
      db.progress,
      db.settings,
      db.directories,
    ],
    async () => {
      await Promise.all([
        db.books.clear(),
        db.volumes.clear(),
        db.files.clear(),
        db.covers.clear(),
        db.progress.clear(),
        db.settings.clear(),
        db.directories.clear(),
      ])
      await db.settings.put({
        key: 'app',
        value: defaults,
        updatedAt: new Date().toISOString(),
      })
    },
  )
}
