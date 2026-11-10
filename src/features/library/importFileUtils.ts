import { parseVolumeNumber } from '../../lib/storage/storageUtils.ts'

export type ImportFileEntry = {
  file: File
  path: string
  rootFolderName?: string
}

export type ImportFileGroup = {
  bookFolderName: string | null
  files: File[]
  coverFile: File | null
}

type FileSystemHandleLike = {
  kind: 'file' | 'directory'
  name: string
  getFile?: () => Promise<File>
  entries?: () => AsyncIterable<[string, FileSystemHandleLike]>
}

type WebkitFileEntry = {
  isFile: true
  isDirectory: false
  name: string
  file: (
    onSuccess: (file: File) => void,
    onError?: (error: DOMException) => void,
  ) => void
}

type WebkitDirectoryEntry = {
  isFile: false
  isDirectory: true
  name: string
  createReader: () => {
    readEntries: (
      onSuccess: (entries: WebkitEntry[]) => void,
      onError?: (error: DOMException) => void,
    ) => void
  }
}

type WebkitEntry = WebkitFileEntry | WebkitDirectoryEntry

type ExtendedDataTransferItem = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandleLike | null>
  webkitGetAsEntry?: () => WebkitEntry | null
}

const coverFilePattern = /^(?:cover|folder)\.(?:jpe?g|png|webp)$/i

function isRelevantFileName(name: string) {
  return name.toLowerCase().endsWith('.epub') || coverFilePattern.test(name)
}

function isEpub(file: File) {
  return file.name.toLowerCase().endsWith('.epub') && file.size > 0
}

function compareVolumes(first: File, second: File) {
  const firstNumber = parseVolumeNumber(first.name)
  const secondNumber = parseVolumeNumber(second.name)
  if (firstNumber !== null && secondNumber !== null && firstNumber !== secondNumber) {
    return firstNumber - secondNumber
  }
  if (firstNumber !== null && secondNumber === null) return -1
  if (firstNumber === null && secondNumber !== null) return 1
  return first.name.localeCompare(second.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function findCover(entries: readonly ImportFileEntry[], folderPath = '') {
  const candidates = entries.filter((entry) => {
    const relative = folderPath
      ? entry.path.slice(folderPath.length + 1)
      : entry.path
    return !relative.includes('/') && coverFilePattern.test(relative)
  })
  return candidates[0]?.file ?? null
}

function filesForFolder(entries: readonly ImportFileEntry[], folderPath = '') {
  return entries
    .filter((entry) => {
      if (!entry.file.name.toLowerCase().endsWith('.epub')) return false
      if (!folderPath) return !entry.path.includes('/')
      return entry.path.startsWith(`${folderPath}/`)
    })
    .map((entry) => entry.file)
    .sort(compareVolumes)
}

export function createImportGroups(entries: readonly ImportFileEntry[]) {
  const rooted = new Map<string, ImportFileEntry[]>()
  const loose: ImportFileEntry[] = []

  for (const entry of entries) {
    if (entry.rootFolderName) {
      const current = rooted.get(entry.rootFolderName) ?? []
      current.push({ ...entry, path: entry.path.replace(/^\/+/, '') })
      rooted.set(entry.rootFolderName, current)
      continue
    }

    const pathParts = entry.path.split('/').filter(Boolean)
    if (pathParts.length > 1) {
      const [rootFolderName, ...relativeParts] = pathParts
      if (!rootFolderName) continue
      const current = rooted.get(rootFolderName) ?? []
      current.push({ ...entry, path: relativeParts.join('/') })
      rooted.set(rootFolderName, current)
    } else {
      loose.push(entry)
    }
  }

  const groups: ImportFileGroup[] = []
  for (const [rootFolderName, rootEntries] of rooted) {
    const rootFiles = filesForFolder(rootEntries)
    const rootCover = findCover(rootEntries)
    if (rootFiles.length > 0) {
      groups.push({
        bookFolderName: rootFolderName,
        files: rootFiles,
        coverFile: rootCover,
      })
    }

    const childFolderNames = new Set(
      rootEntries.flatMap((entry) => {
        const [childFolder] = entry.path.split('/')
        return entry.path.includes('/') && childFolder ? [childFolder] : []
      }),
    )
    for (const childFolderName of childFolderNames) {
      const childPath = childFolderName
      const files = filesForFolder(rootEntries, childPath)
      if (files.length === 0) continue
      groups.push({
        bookFolderName: childFolderName,
        files,
        coverFile: findCover(rootEntries, childPath),
      })
    }
  }

  for (const entry of loose) {
    if (!isEpub(entry.file)) continue
    groups.push({
      bookFolderName: null,
      files: [entry.file],
      coverFile: null,
    })
  }

  return groups
}

async function collectDirectoryHandle(
  directory: FileSystemHandleLike,
  rootFolderName = directory.name,
  parentPath = '',
): Promise<ImportFileEntry[]> {
  if (!directory.entries) return []
  const files: ImportFileEntry[] = []
  for await (const [name, entry] of directory.entries()) {
    const path = parentPath ? `${parentPath}/${name}` : name
    if (entry.kind === 'directory') {
      files.push(
        ...(await collectDirectoryHandle(entry, rootFolderName, path)),
      )
    } else if (entry.getFile && isRelevantFileName(name)) {
      files.push({
        file: await entry.getFile(),
        path,
        rootFolderName,
      })
    }
  }
  return files
}

export function collectDirectoryHandleFiles(
  directory: FileSystemDirectoryHandle,
) {
  return collectDirectoryHandle(directory as unknown as FileSystemHandleLike)
}

function readWebkitFile(entry: WebkitFileEntry) {
  return new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject)
  })
}

function readWebkitDirectoryBatch(
  reader: ReturnType<WebkitDirectoryEntry['createReader']>,
) {
  return new Promise<WebkitEntry[]>((resolve, reject) => {
    reader.readEntries(resolve, reject)
  })
}

async function collectWebkitEntry(
  entry: WebkitEntry,
  rootFolderName = entry.name,
  parentPath = '',
): Promise<ImportFileEntry[]> {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name
  if (entry.isFile) {
    if (!isRelevantFileName(entry.name)) return []
    return [
      {
        file: await readWebkitFile(entry),
        path: parentPath ? path.slice(rootFolderName.length + 1) : entry.name,
        ...(parentPath ? { rootFolderName } : {}),
      },
    ]
  }

  const descendants: ImportFileEntry[] = []
  const reader = entry.createReader()
  for (;;) {
    const batch = await readWebkitDirectoryBatch(reader)
    if (batch.length === 0) break
    for (const child of batch) {
      descendants.push(
        ...(await collectWebkitEntry(child, rootFolderName, path)),
      )
    }
  }
  return descendants
}

export async function collectDroppedEntries(dataTransfer: DataTransfer) {
  const entries: ImportFileEntry[] = []
  const errors: string[] = []
  const items = Array.from(dataTransfer.items).filter(
    (item) => item.kind === 'file',
  ) as ExtendedDataTransferItem[]

  for (const item of items) {
    let collected = false
    let handleError: unknown
    if (item.getAsFileSystemHandle) {
      try {
        const handle = await item.getAsFileSystemHandle()
        if (handle) {
          if (handle.kind === 'directory') {
            entries.push(...(await collectDirectoryHandle(handle)))
          } else if (handle.getFile) {
            entries.push({ file: await handle.getFile(), path: handle.name })
          }
          collected = true
        }
      } catch (error) {
        handleError = error
      }
    }
    if (collected) continue

    const webkitEntry = (item.webkitGetAsEntry?.() ?? null) as WebkitEntry | null
    if (webkitEntry) {
      try {
        entries.push(...(await collectWebkitEntry(webkitEntry)))
        continue
      } catch (error) {
        errors.push(
          error instanceof Error
            ? error.message
            : 'Could not read a dropped folder.',
        )
        continue
      }
    }

    const file = item.getAsFile()
    if (file && isRelevantFileName(file.name)) {
      entries.push({ file, path: file.webkitRelativePath || file.name })
    } else if (handleError) {
      errors.push(
        handleError instanceof Error
          ? handleError.message
          : 'Could not read a dropped item.',
      )
    }
  }

  if (items.length === 0) {
    entries.push(
      ...Array.from(dataTransfer.files, (file) => ({
        file,
        path: file.webkitRelativePath || file.name,
      })),
    )
  }

  return { groups: createImportGroups(entries), errors }
}

export function collectInputFiles(files: readonly File[]) {
  return createImportGroups(
    files.map((file) => ({
      file,
      path: file.webkitRelativePath || file.name,
    })),
  )
}

export function canSelectFolderWithInput() {
  return (
    typeof document !== 'undefined' &&
    'webkitdirectory' in document.createElement('input')
  )
}