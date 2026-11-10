import { BlobReader, BlobWriter, TextWriter, ZipReader } from '@zip.js/zip.js'

type WorkerRequest = { file: File }

type SpineIndexEntry = {
  idref: string
  href: string
  linear?: boolean
}

type TableOfContentsEntry = {
  id: string
  title: string
  href: string
}

type ParsedEpub = {
  hash: string | null
  title: string
  author: string
  seriesName: string | null
  volumeNumber: number | null
  volumeTitle: string
  cover: Blob | null
  spineIndex: SpineIndexEntry[]
  toc: TableOfContentsEntry[]
}

type WorkerResponse =
  | { ok: true; epub: ParsedEpub }
  | {
      ok: false
      code: 'invalid' | 'corrupt' | 'drm' | 'no-spine'
      message: string
    }

type ArchiveEntry = Awaited<ReturnType<ZipReader<Blob>['getEntries']>>[number]

const workerScope = self as typeof globalThis & {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (message: WorkerResponse) => void
}

function decodeXml(value: string) {
  return value
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function attributes(source: string) {
  const result = new Map<string, string>()
  const pattern = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  for (const match of source.matchAll(pattern)) {
    result.set(match[1].toLowerCase(), decodeXml(match[3] ?? match[4] ?? ''))
  }
  return result
}

function elements(source: string, localName: string) {
  const escapedName = localName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `<((?:[\\w.-]+:)?${escapedName})\\b([^>]*?)(?:\\/\\s*>|>([\\s\\S]*?)<\\/\\1\\s*>)`,
    'gi',
  )
  return [...source.matchAll(pattern)].map((match) => ({
    attributes: attributes(match[2]),
    content: match[3] ?? '',
  }))
}

function textContent(source: string) {
  return decodeXml(source.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveArchivePath(basePath: string, href: string) {
  const cleanHref = decodeURIComponent(href.split(/[?#]/, 1)[0])
  const parts = basePath.split('/').slice(0, -1)
  for (const part of cleanHref.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

async function readEntryText(entry: ArchiveEntry) {
  if (entry.directory) throw new Error('Expected an EPUB file entry')
  return entry.getData(new TextWriter())
}

async function readEntryBlob(entry: ArchiveEntry, mediaType: string) {
  if (entry.directory) throw new Error('Expected an EPUB file entry')
  return entry.getData(new BlobWriter(mediaType))
}

function getSeriesMetadata(packageXml: string) {
  let seriesName: string | null = null
  let volumeNumber: number | null = null
  const seriesRefinements = new Set<string>()

  for (const meta of elements(packageXml, 'meta')) {
    const property = meta.attributes.get('property')?.toLowerCase()
    const refinement = meta.attributes.get('refines')
    const content = meta.attributes.get('content') ?? textContent(meta.content)

    if (property === 'belongs-to-collection' && content) {
      seriesName = content
      const id = meta.attributes.get('id')
      if (id) seriesRefinements.add(`#${id}`)
    }
    if (property === 'collection-type' && content.toLowerCase() === 'series') {
      if (refinement) seriesRefinements.add(refinement)
    }
    if (property === 'group-position' && content) {
      const parsed = Number.parseFloat(content)
      if (Number.isFinite(parsed) && parsed > 0)
        volumeNumber = Math.floor(parsed)
    }

    const name = meta.attributes.get('name')?.toLowerCase()
    if (name === 'calibre:series' && content) seriesName = content
    if (name === 'calibre:series_index' && content) {
      const parsed = Number.parseFloat(content)
      if (Number.isFinite(parsed) && parsed > 0)
        volumeNumber = Math.floor(parsed)
    }
  }

  if (seriesRefinements.size > 0) {
    for (const meta of elements(packageXml, 'meta')) {
      const refinement = meta.attributes.get('refines')
      const property = meta.attributes.get('property')?.toLowerCase()
      const content = textContent(meta.content)
      if (
        refinement &&
        seriesRefinements.has(refinement) &&
        property === 'collection-type' &&
        content.toLowerCase() === 'series'
      ) {
        continue
      }
      if (
        refinement &&
        seriesRefinements.has(refinement) &&
        property === 'group-position'
      ) {
        const parsed = Number.parseFloat(content)
        if (Number.isFinite(parsed) && parsed > 0) {
          volumeNumber = Math.floor(parsed)
        }
      }
    }
  }

  return { seriesName, volumeNumber }
}

function parseToc(navigationXml: string, ncxXml: string, opfPath: string) {
  const entries: TableOfContentsEntry[] = []

  for (const nav of elements(navigationXml, 'nav')) {
    const navType = [...nav.attributes.entries()].find(([key]) =>
      key.endsWith(':type'),
    )?.[1]
    if (navType !== 'toc') continue

    for (const anchor of elements(nav.content, 'a')) {
      const href = anchor.attributes.get('href')
      const title = textContent(anchor.content)
      if (href && title) {
        entries.push({
          id: `toc-${entries.length + 1}`,
          title,
          href: resolveArchivePath(opfPath, href),
        })
      }
    }
    if (entries.length > 0) break
  }

  if (entries.length === 0) {
    for (const point of elements(ncxXml, 'navPoint')) {
      const content = elements(point.content, 'content')[0]
      const label = elements(point.content, 'text')[0]
      const href = content?.attributes.get('src')
      const title = label ? textContent(label.content) : ''
      if (href && title) {
        entries.push({
          id: `toc-${entries.length + 1}`,
          title,
          href: resolveArchivePath(opfPath, href),
        })
      }
    }
  }

  return entries
}

function errorResponse(error: unknown): WorkerResponse {
  const detail = error instanceof Error ? error.message : ''
  if (/password|encrypted|decrypt|unsupported compression/i.test(detail)) {
    return {
      ok: false,
      code: 'drm',
      message: 'This EPUB appears to be encrypted or DRM-protected.',
    }
  }
  return {
    ok: false,
    code: 'corrupt',
    message:
      'This file is not a readable EPUB. Check that it is complete and uncorrupted.',
  }
}

async function parseEpub(file: File): Promise<ParsedEpub> {
  let hash: string | null = null
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      await file.arrayBuffer(),
    )
    hash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  }

  const reader = new ZipReader(new BlobReader(file))
  try {
    const entries = await reader.getEntries()
    const entryByName = new Map(entries.map((entry) => [entry.filename, entry]))
    const container = entryByName.get('META-INF/container.xml')
    if (!container) throw new Error('Missing EPUB container')

    const containerXml = await readEntryText(container)
    const packagePath = elements(containerXml, 'rootfile')[0]?.attributes.get(
      'full-path',
    )
    if (!packagePath) throw new Error('Missing package document')
    const opfPath = packagePath
    const packageEntry = entryByName.get(opfPath)
    if (!packageEntry) throw new Error('Missing package document')

    const encryptionEntry = entryByName.get('META-INF/encryption.xml')
    if (encryptionEntry) {
      const encryptionXml = await readEntryText(encryptionEntry)
      const unsupportedEncryption = elements(
        encryptionXml,
        'EncryptedData',
      ).some((encryptedData) => {
        const algorithm = elements(
          encryptedData.content,
          'EncryptionMethod',
        )[0]?.attributes.get('algorithm')
        return (
          algorithm !== undefined &&
          algorithm !== 'http://www.idpf.org/2008/embedding' &&
          algorithm !== 'http://ns.adobe.com/pdf/enc#RC'
        )
      })
      if (unsupportedEncryption) {
        throw new Error('Encrypted EPUB content')
      }
    }

    const packageXml = await readEntryText(packageEntry)
    const manifest = elements(packageXml, 'item').map((item) => item.attributes)
    const manifestItems = manifest.map((item) => ({
      id: item.get('id') ?? '',
      href: item.get('href') ?? '',
      mediaType: item.get('media-type') ?? '',
      properties: item.get('properties')?.split(/\s+/) ?? [],
    }))
    const byId = new Map(manifestItems.map((item) => [item.id, item]))
    const spineElement = elements(packageXml, 'spine')[0]
    const spineIndex = spineElement
      ? elements(spineElement.content, 'itemref').flatMap((itemref) => {
          const idref = itemref.attributes.get('idref')
          const manifestItem = idref ? byId.get(idref) : undefined
          if (!idref || !manifestItem) return []
          const linear = itemref.attributes.get('linear')
          return [
            {
              idref,
              href: resolveArchivePath(opfPath, manifestItem.href),
              ...(linear ? { linear: linear.toLowerCase() !== 'no' } : {}),
            },
          ]
        })
      : []
    if (spineIndex.length === 0) {
      throw Object.assign(new Error('EPUB has no readable spine'), {
        code: 'no-spine',
      })
    }

    const title = textContent(elements(packageXml, 'title')[0]?.content ?? '')
    const author = textContent(
      elements(packageXml, 'creator')[0]?.content ?? '',
    )
    if (!title) throw new Error('Missing EPUB title')

    const series = getSeriesMetadata(packageXml)
    const legacyCoverId = elements(packageXml, 'meta')
      .find((meta) => meta.attributes.get('name')?.toLowerCase() === 'cover')
      ?.attributes.get('content')
    const coverItem =
      manifestItems.find((item) => item.properties.includes('cover-image')) ??
      manifestItems.find((item) => item.id === legacyCoverId)
    const coverEntry = coverItem
      ? entryByName.get(resolveArchivePath(opfPath, coverItem.href))
      : undefined
    const cover = coverEntry
      ? await readEntryBlob(coverEntry, coverItem?.mediaType || 'image/jpeg')
      : null

    const navItem = manifestItems.find((item) =>
      item.properties.includes('nav'),
    )
    const ncxId = spineElement?.attributes.get('toc')
    const ncxItem =
      (ncxId ? byId.get(ncxId) : undefined) ??
      manifestItems.find(
        (item) => item.mediaType === 'application/x-dtbncx+xml',
      )
    const navigationEntry = navItem
      ? entryByName.get(resolveArchivePath(opfPath, navItem.href))
      : undefined
    const ncxEntry = ncxItem
      ? entryByName.get(resolveArchivePath(opfPath, ncxItem.href))
      : undefined
    const navigationXml = navigationEntry
      ? await readEntryText(navigationEntry)
      : ''
    const ncxXml = ncxEntry ? await readEntryText(ncxEntry) : ''
    const toc = parseToc(navigationXml, ncxXml, opfPath)

    return {
      hash,
      title,
      author: author || 'Unknown author',
      seriesName: series.seriesName,
      volumeNumber: series.volumeNumber,
      volumeTitle: title,
      cover,
      spineIndex,
      toc,
    }
  } finally {
    await reader.close()
  }
}

workerScope.onmessage = (event) => {
  const { file } = event.data
  if (!file || file.size === 0) {
    workerScope.postMessage({
      ok: false,
      code: 'invalid',
      message: 'Choose a non-empty EPUB file.',
    })
    return
  }

  void parseEpub(file)
    .then((epub) => workerScope.postMessage({ ok: true, epub }))
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'no-spine'
      ) {
        workerScope.postMessage({
          ok: false,
          code: 'no-spine',
          message: 'This EPUB has no readable reading order (spine).',
        })
        return
      }
      workerScope.postMessage(errorResponse(error))
    })
}
