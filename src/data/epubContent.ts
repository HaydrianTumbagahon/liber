import { db } from './database.ts'
import { storageProvider } from '../lib/storage/index.ts'

export type EpubChapterAsset = {
  href: string
  blob: Blob
}

export type EpubChapterContent = {
  html: string
  assets: EpubChapterAsset[]
}

export async function readStoredEpubChapter(
  volumeId: string,
  href: string,
): Promise<EpubChapterContent> {
  const volume = await db.volumes.get(volumeId)
  if (
    volume?.sourceDirectoryId === 'app-root' &&
    volume.sourceRelativePath &&
    storageProvider.isConnected()
  ) {
    const file = await storageProvider.readBookFile(volume.sourceRelativePath)
    return readEpubChapter(file, href)
  }
  if (!volume?.fileId) {
    throw new Error('This volume file is missing. Re-add the EPUB to read it.')
  }
  const file = await db.files.get(volume.fileId)
  if (!file) {
    throw new Error('This volume file is missing. Re-add the EPUB to read it.')
  }
  return readEpubChapter(file.blob, href)
}

type WorkerResponse =
  ({ ok: true } & EpubChapterContent) | { ok: false; message: string }

export function readEpubChapter(
  file: Blob,
  href: string,
): Promise<EpubChapterContent> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./epubContent.worker.ts', import.meta.url),
      { type: 'module' },
    )

    const finish = (callback: () => void) => {
      worker.terminate()
      callback()
    }

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if ('html' in event.data) {
        const { html, assets } = event.data
        finish(() => resolve({ html, assets }))
      } else {
        const { message } = event.data
        finish(() => reject(new Error(message)))
      }
    }

    worker.onerror = () => {
      finish(() => reject(new Error('The EPUB chapter worker failed.')))
    }

    worker.postMessage({ file, href })
  })
}
