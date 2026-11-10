import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Book } from '../../data/mockBooks.ts'
import { db } from '../../data/database.ts'
import { storageProvider } from '../../lib/storage/index.ts'
import type {
  DatabaseBook,
  DatabaseProgress,
  DatabaseVolume,
} from '../../data/database.ts'

type LibrarySnapshot = {
  book: DatabaseBook
  volumes: Array<{
    volume: DatabaseVolume
    progress: DatabaseProgress | undefined
  }>
  cover: Blob | null
}

async function readLibrary(): Promise<LibrarySnapshot[]> {
  await storageProvider.listLibrary()
  const books = await db.books.orderBy('dateAdded').toArray()

  return Promise.all(
    books.map(async (book) => {
      const volumes = await db.volumes
        .where('bookId')
        .equals(book.id)
        .sortBy('number')
      const progress = await Promise.all(
        volumes.map((volume) => db.progress.get(volume.stableKey)),
      )
      const coverRecord = book.coverBlobId
        ? await db.covers.get(book.coverBlobId)
        : undefined

      return {
        book,
        volumes: volumes.map((volume, index) => ({
          volume,
          progress: progress[index],
        })),
        cover: coverRecord?.blob ?? null,
      }
    }),
  )
}

function toBook(
  snapshot: LibrarySnapshot,
  index: number,
  objectUrls: string[],
): Book {
  const { book, volumes } = snapshot
  const bookVolumes = volumes.map(({ volume, progress }) => ({
    number: volume.number,
    title: volume.title,
    progress: progress?.percent ?? 0,
  }))
  const progressValues = volumes.map(({ progress }) => progress?.percent ?? 0)
  const status =
    progressValues.length > 0 && progressValues.every((value) => value >= 100)
      ? 'completed'
      : progressValues.some((value) => value > 0)
        ? 'in-progress'
        : 'unread'
  const readDates = volumes
    .map(({ progress }) =>
      progress && progress.percent > 0 ? progress.updatedAt : null,
    )
    .filter((date): date is string => date !== null)
    .sort((first, second) => second.localeCompare(first))
  const coverUrl = snapshot.cover
    ? URL.createObjectURL(snapshot.cover)
    : `/covers/book-${String((index % 12) + 1).padStart(2, '0')}.svg`

  if (snapshot.cover) objectUrls.push(coverUrl)

  return {
    id: book.id,
    title: book.title,
    sourceTags: book.sourceTags,
    author: book.author,
    coverUrl,
    volumes: bookVolumes,
    dateAdded: book.dateAdded,
    dateModified: book.dateModified,
    lastRead: readDates[0] ?? book.lastRead,
    status,
    missingFile:
      book.missingFile || volumes.some(({ volume }) => volume.fileMissing),
  }
}

export function useLibrary(): readonly Book[] {
  const snapshots = useLiveQuery(readLibrary, [], [])
  const [books, setBooks] = useState<readonly Book[]>([])

  useEffect(() => {
    const objectUrls: string[] = []
    setBooks(
      snapshots.map((snapshot, index) => toBook(snapshot, index, objectUrls)),
    )
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url))
  }, [snapshots])

  return books
}
