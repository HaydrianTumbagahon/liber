import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data/database.ts'
import { storageProvider } from '../../lib/storage/index.ts'
import type {
  DatabaseBook,
  DatabaseProgress,
  DatabaseVolume,
} from '../../data/database.ts'

export type ReaderVolumeSnapshot = {
  volume: DatabaseVolume
  progress: DatabaseProgress | undefined
}

export type ReaderBookSnapshot = {
  book: DatabaseBook
  volumes: ReaderVolumeSnapshot[]
}

async function readReaderBook(bookId: string | undefined) {
  if (!bookId) return undefined
  await storageProvider.listLibrary()
  await storageProvider.readProgress()
  const book = await db.books.get(bookId)
  if (!book) return undefined

  const volumes = await db.volumes
    .where('bookId')
    .equals(bookId)
    .sortBy('number')
  const progress = await Promise.all(
    volumes.map((volume) => db.progress.get(volume.stableKey)),
  )

  return {
    book,
    volumes: volumes.map((volume, index) => ({
      volume,
      progress: progress[index],
    })),
  } satisfies ReaderBookSnapshot
}

export function useReaderBook(bookId: string | undefined) {
  return useLiveQuery(() => readReaderBook(bookId), [bookId], null)
}
