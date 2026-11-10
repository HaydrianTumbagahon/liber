import { BlobReader, BlobWriter, TextWriter, ZipReader } from '@zip.js/zip.js'

type WorkerRequest = { file: Blob; href: string }

type ChapterAsset = { href: string; blob: Blob }

type WorkerResponse =
  | { ok: true; html: string; assets: ChapterAsset[] }
  | { ok: false; message: string }

type ArchiveEntry = Awaited<ReturnType<ZipReader<Blob>['getEntries']>>[number]

const workerScope = self as typeof globalThis & {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (message: WorkerResponse) => void
}

function resolveArchivePath(basePath: string, href: string) {
  const cleanHref = decodeURIComponent(href.split(/[?#]/, 1)[0])
  const parts = cleanHref.startsWith('/')
    ? []
    : basePath.split('/').slice(0, -1)
  for (const part of cleanHref.replace(/^\//, '').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

function imageMediaType(href: string) {
  const extension = href.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'avif':
      return 'image/avif'
    case 'gif':
      return 'image/gif'
    case 'jpeg':
    case 'jpg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'svg':
    case 'svgz':
      return 'image/svg+xml'
    case 'webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

async function readText(entry: ArchiveEntry) {
  if (entry.directory) throw new Error('Chapter entry is not a file')
  return entry.getData(new TextWriter())
}

async function readBlob(entry: ArchiveEntry, mediaType: string) {
  if (entry.directory) throw new Error('Image entry is not a file')
  return entry.getData(new BlobWriter(mediaType))
}

async function readChapter({ file, href }: WorkerRequest) {
  const reader = new ZipReader(new BlobReader(file))
  try {
    const entries = await reader.getEntries()
    const entryByName = new Map(entries.map((entry) => [entry.filename, entry]))
    const chapter = entryByName.get(href)
    if (!chapter) throw new Error('The saved EPUB chapter could not be found.')

    const html = await readText(chapter)
    const assets: ChapterAsset[] = []
    const referencedPaths = new Set<string>()
    const imagePattern =
      /<(?:img|image)\b[^>]*?\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi
    for (const match of html.matchAll(imagePattern)) {
      const reference = match[2].trim()
      if (!reference || /^(?:data:|https?:|blob:|\/\/)/i.test(reference)) {
        continue
      }
      referencedPaths.add(resolveArchivePath(href, reference))
    }

    for (const assetPath of referencedPaths) {
      const entry = entryByName.get(assetPath)
      if (!entry || entry.directory) continue
      assets.push({
        href: assetPath,
        blob: await readBlob(entry, imageMediaType(assetPath)),
      })
    }

    return { html, assets }
  } finally {
    await reader.close()
  }
}

workerScope.onmessage = (event) => {
  void readChapter(event.data)
    .then((chapter) => workerScope.postMessage({ ok: true, ...chapter }))
    .catch((error: unknown) =>
      workerScope.postMessage({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : 'Could not read this chapter from the EPUB.',
      }),
    )
}
