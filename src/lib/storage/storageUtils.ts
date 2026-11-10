export type FileIndexFingerprint = {
  size: number
  lastModified: number
  sha256: string | null
}

const bracketPairs = new Map([
  [']', '['],
  [')', '('],
  ['】', '【'],
  ['}', '{'],
])

function removeTrailingTagGroup(value: string) {
  const end = value.trimEnd()
  const closing = end.at(-1)
  const opening = closing ? bracketPairs.get(closing) : undefined
  if (!opening) return null
  const openingIndex = end.lastIndexOf(opening)
  if (openingIndex < 0) return null
  return {
    before: end.slice(0, openingIndex).trimEnd(),
    tag: end.slice(openingIndex + 1, -1).trim(),
  }
}

export function parseBookFolderName(folderName: string) {
  let title = folderName.trim()
  const sourceTags: string[] = []

  for (;;) {
    const group = removeTrailingTagGroup(title)
    if (!group) break
    if (group.tag) sourceTags.unshift(group.tag)
    title = group.before
  }

  return {
    title: title || 'Untitled book',
    sourceTags,
  }
}

export function stripTrailingTagGroups(value: string) {
  return parseBookFolderName(value).title
}

export function parseVolumeNumber(fileName: string) {
  const basename = fileName.replace(/\\/g, '/').split('/').pop() ?? fileName
  const withoutExtension = basename.replace(/\.epub$/i, '')
  const japanese = /第\s*0*(\d+)\s*巻/u.exec(withoutExtension)
  if (japanese?.[1]) return Number.parseInt(japanese[1], 10)

  const romanized = /(?:^|[\s._-])(?:volume|vol\.?|v)\s*0*(\d+)(?=$|[\s._-])/iu.exec(
    withoutExtension,
  )
  if (romanized?.[1]) return Number.parseInt(romanized[1], 10)

  const hashNumber = /(?:^|[\s._-])#\s*0*(\d+)(?=$|[\s._-])/u.exec(
    withoutExtension,
  )
  return hashNumber?.[1] ? Number.parseInt(hashNumber[1], 10) : null
}

export function compareNatural(first: string, second: string) {
  return first.localeCompare(second, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

type DirectoryHandleLike = {
  name: string
  getDirectoryHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<DirectoryHandleLike>
}

export function calculateLibraryDiff(
  previous: Readonly<Record<string, FileIndexFingerprint>>,
  current: Readonly<Record<string, FileIndexFingerprint>>,
) {
  const previousPaths = new Set(Object.keys(previous))
  const currentPaths = new Set(Object.keys(current))
  const added = [...currentPaths].filter((path) => !previousPaths.has(path))
  const removed = [...previousPaths].filter((path) => !currentPaths.has(path))
  const changed = [...currentPaths].filter((path) => {
    const before = previous[path]
    const after = current[path]
    return Boolean(
      before &&
        after &&
        (before.size !== after.size ||
          before.lastModified !== after.lastModified ||
          before.sha256 !== after.sha256),
    )
  })
  return { added, removed, changed }
}

export async function resolveApplicationDirectory<T extends DirectoryHandleLike>(
  selectedDirectory: T,
  appName = 'liber',
  create = true,
): Promise<T> {
  if (selectedDirectory.name.toLocaleLowerCase() === appName.toLocaleLowerCase()) {
    return selectedDirectory
  }

  const candidates = [...new Set([appName, ...(appName === 'liber' ? ['Liber'] : [])])]
  for (const candidate of candidates) {
    try {
      return (await selectedDirectory.getDirectoryHandle(candidate, {
        create: false,
      })) as T
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== 'NotFoundError') {
        throw error
      }
    }
  }

  if (!create) throw new DOMException('Library folder is missing.', 'NotFoundError')
  return (await selectedDirectory.getDirectoryHandle(appName, { create: true })) as T
}

export type FolderAccessChecks = {
  pickerPropertyPresent: boolean
  pickerCallable: boolean
  secureContext: boolean
  topLevel: boolean
}

export type FolderAccessAssessment = {
  supported: boolean
  reason: string
  checks: FolderAccessChecks
}

export function assessFolderAccess(
  checks: FolderAccessChecks,
): FolderAccessAssessment {
  const reasons: string[] = []
  if (!checks.pickerPropertyPresent || !checks.pickerCallable) {
    reasons.push('this browser does not provide the folder picker')
  }
  if (!checks.secureContext) reasons.push('folder access requires HTTPS')
  if (!checks.topLevel) reasons.push('folder access is blocked in embedded frames')

  return {
    supported: reasons.length === 0,
    reason: reasons.join('; '),
    checks,
  }
}

export function getFolderAccessChecks(): FolderAccessChecks {
  if (typeof window === 'undefined') {
    return {
      pickerPropertyPresent: false,
      pickerCallable: false,
      secureContext: false,
      topLevel: false,
    }
  }

  const pickerPropertyPresent = 'showDirectoryPicker' in window
  const pickerCallable =
    pickerPropertyPresent &&
    typeof (window as Window & { showDirectoryPicker?: unknown })
      .showDirectoryPicker === 'function'
  return {
    pickerPropertyPresent,
    pickerCallable,
    secureContext: window.isSecureContext,
    topLevel: window.self === window.top,
  }
}

export function getFolderAccessAssessment() {
  return assessFolderAccess(getFolderAccessChecks())
}

export function logFolderAccessChecks() {
  const assessment = getFolderAccessAssessment()
  if (folderAccessChecksLogged) return assessment
  folderAccessChecksLogged = true
  console.info(
    '[liber:folder-access] "showDirectoryPicker" in window:',
    assessment.checks.pickerPropertyPresent && assessment.checks.pickerCallable,
  )
  console.info(
    '[liber:folder-access] secure context:',
    assessment.checks.secureContext,
  )
  console.info('[liber:folder-access] top-level frame:', assessment.checks.topLevel)
  return assessment
}

let folderAccessChecksLogged = false