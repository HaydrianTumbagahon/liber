import type { EpubChapterAsset } from '../../data/epubContent.ts'

export type SanitizedChapter = {
  html: string
  plainText: string
  sentences: string[]
  objectUrls: string[]
}

const allowedElements = new Set([
  'a',
  'abbr',
  'article',
  'aside',
  'b',
  'blockquote',
  'br',
  'caption',
  'cite',
  'code',
  'dd',
  'del',
  'div',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'section',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
])

const dropSubtreeElements = new Set([
  'audio',
  'canvas',
  'embed',
  'form',
  'iframe',
  'link',
  'object',
  'script',
  'style',
  'svg',
  'video',
])

function resolveArchivePath(baseHref: string, href: string) {
  let path: string
  try {
    path = decodeURIComponent(href).split(/[?#]/, 1)[0]
  } catch {
    return null
  }
  if (!path || /^(?:data:|https?:|blob:|\/\/)/i.test(path)) return null

  const parts = path.startsWith('/') ? [] : baseHref.split('/').slice(0, -1)
  for (const part of path.replace(/^\//, '').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (parts.length === 0) return null
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return parts.join('/')
}

function appendCleanNode(
  source: Node,
  target: Node,
  document: Document,
  assets: ReadonlyMap<string, string>,
  baseHref: string,
) {
  if (source.nodeType === Node.TEXT_NODE) {
    target.appendChild(document.createTextNode(source.textContent ?? ''))
    return
  }
  if (!(source instanceof Element)) return

  const tagName = source.localName.toLowerCase()
  if (dropSubtreeElements.has(tagName)) return
  if (!allowedElements.has(tagName)) {
    for (const child of source.childNodes) {
      appendCleanNode(child, target, document, assets, baseHref)
    }
    return
  }

  const cleanElement = document.createElement(tagName)
  if (tagName === 'img') {
    const sourcePath = resolveArchivePath(
      baseHref,
      source.getAttribute('src') ?? '',
    )
    const imageUrl = sourcePath ? assets.get(sourcePath) : undefined
    if (!imageUrl) return
    cleanElement.setAttribute('src', imageUrl)
    cleanElement.setAttribute('loading', 'lazy')
    cleanElement.setAttribute('decoding', 'async')
  }

  for (const attribute of ['alt', 'title', 'id', 'lang', 'dir']) {
    const value = source.getAttribute(attribute)
    if (!value) continue
    if (attribute === 'id' && !/^[\w:.-]+$/.test(value)) continue
    if (attribute === 'lang' && !/^[\w-]{1,35}$/.test(value)) continue
    if (attribute === 'dir' && !['ltr', 'rtl', 'auto'].includes(value)) continue
    cleanElement.setAttribute(attribute, value)
  }

  for (const attribute of ['width', 'height', 'colspan', 'rowspan', 'start']) {
    const value = source.getAttribute(attribute)
    if (value && /^\d{1,5}$/.test(value)) {
      cleanElement.setAttribute(attribute, value)
    }
  }

  if (tagName === 'a') {
    const href = source.getAttribute('href') ?? ''
    if (/^#[\w:.-]+$/.test(href)) cleanElement.setAttribute('href', href)
    const semanticType = `${source.getAttribute('epub:type') ?? ''} ${source.getAttribute('role') ?? ''}`
    if (
      /noteref|footnote/i.test(semanticType) ||
      /^#(?:fn|footnote)/i.test(href)
    ) {
      cleanElement.setAttribute('data-tts-skip', 'true')
    }
  }

  for (const child of source.childNodes) {
    appendCleanNode(child, cleanElement, document, assets, baseHref)
  }
  target.appendChild(cleanElement)
}

export function sanitizeEpubHtml(
  html: string,
  chapterHref: string,
  chapterAssets: readonly EpubChapterAsset[],
): SanitizedChapter {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const objectUrls: string[] = []
  const assets = new Map<string, string>()
  for (const asset of chapterAssets) {
    if (!asset.blob.type.startsWith('image/')) continue
    const objectUrl = URL.createObjectURL(asset.blob)
    objectUrls.push(objectUrl)
    assets.set(asset.href, objectUrl)
  }

  const cleanDocument = document.implementation.createHTMLDocument('')
  for (const child of parsed.body.childNodes) {
    appendCleanNode(
      child,
      cleanDocument.body,
      cleanDocument,
      assets,
      chapterHref,
    )
  }

  const sentences: string[] = []
  const sentenceSegmenter =
    typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter(undefined, { granularity: 'sentence' })
      : null
  const walker = cleanDocument.createTreeWalker(
    cleanDocument.body,
    NodeFilter.SHOW_TEXT,
  )
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    if (!node.nodeValue?.trim()) continue
    if (node.parentElement?.closest('rt, rp, sup, [data-tts-skip="true"]')) {
      continue
    }
    textNodes.push(node)
  }

  for (const node of textNodes) {
    const text = node.nodeValue ?? ''
    const parts = sentenceSegmenter
      ? [...sentenceSegmenter.segment(text)].map((part) => part.segment)
      : [text]
    const fragment = cleanDocument.createDocumentFragment()
    for (const part of parts) {
      if (!part.trim()) {
        fragment.appendChild(cleanDocument.createTextNode(part))
        continue
      }
      const sentence = cleanDocument.createElement('span')
      sentence.className = 'reader-sentence'
      sentence.dataset.ttsSentenceIndex = String(sentences.length)
      sentence.textContent = part
      sentences.push(part.trim())
      fragment.appendChild(sentence)
    }
    node.replaceWith(fragment)
  }

  return {
    html: cleanDocument.body.innerHTML,
    plainText: sentences.join(' '),
    sentences,
    objectUrls,
  }
}
