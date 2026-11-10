export type EpubImportErrorCode = 'invalid' | 'corrupt' | 'drm' | 'no-spine'

export class EpubImportError extends Error {
  readonly code: EpubImportErrorCode

  constructor(code: EpubImportErrorCode, message: string) {
    super(message)
    this.name = 'EpubImportError'
    this.code = code
  }
}

export type SpineIndexEntry = {
  idref: string
  href: string
  linear?: boolean
}

export type TableOfContentsEntry = {
  id: string
  title: string
  href: string
}

export type ParsedEpub = {
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
  | { ok: false; code: EpubImportErrorCode; message: string }

export function parseEpubFile(file: File): Promise<ParsedEpub> {
  if (!file.name.toLowerCase().endsWith('.epub') || file.size === 0) {
    return Promise.reject(
      new EpubImportError('invalid', 'Choose a non-empty EPUB file.'),
    )
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./epubParser.worker.ts', import.meta.url),
      {
        type: 'module',
      },
    )

    const finish = (callback: () => void) => {
      worker.terminate()
      callback()
    }

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if ('epub' in event.data) {
        const epub = event.data.epub
        finish(() => resolve(epub))
      } else {
        const { code, message } = event.data
        finish(() => reject(new EpubImportError(code, message)))
      }
    }

    worker.onerror = () => {
      finish(() =>
        reject(
          new EpubImportError(
            'corrupt',
            'The EPUB parser could not read this file. Check that it is complete and uncorrupted.',
          ),
        ),
      )
    }

    worker.postMessage({ file })
  })
}
