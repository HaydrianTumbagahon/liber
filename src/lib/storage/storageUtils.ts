export type FileIndexFingerprint = {
  size: number
  lastModified: number
  sha256: string | null
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