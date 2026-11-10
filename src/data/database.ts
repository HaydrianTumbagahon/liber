import Dexie, { type Table } from 'dexie'
import type { AppSettings } from '../lib/theme.tsx'

export type SourceInfo = {
  kind: 'epub' | 'seed'
  fileName: string | null
  sourceFileHash: string | null
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

export type DatabaseBook = {
  id: string
  title: string
  author: string
  seriesKey: string
  coverBlobId: string | null
  dateAdded: string
  dateModified: string
  lastRead: string | null
  sourceInfo: SourceInfo
  missingFile: boolean
}

export type DatabaseVolume = {
  id: string
  stableKey: string
  bookId: string
  number: number
  title: string
  spineIndex: readonly SpineIndexEntry[]
  toc: readonly TableOfContentsEntry[]
  sourceFileHash: string | null
  fileId: string | null
  fileMissing: boolean
  sourceDirectoryId?: string
  sourceRelativePath?: string
}

export type DatabaseFile = {
  id: string
  blob: Blob
  size: number
  sha256: string | null
}

export type DatabaseCover = {
  id: string
  blob: Blob
  size: number
  kind: 'epub' | 'generated' | 'custom'
}

export type ProgressPosition = {
  scrollOffset?: number
  chapterIndex?: number
  sentenceIndex?: number
  pageIndex?: number
  characterOffset?: number
}

export type DatabaseProgress = {
  stableKey: string
  volumeId: string
  bookId: string
  position: ProgressPosition
  percent: number
  updatedAt: string
}

export type DatabaseSettings = {
  key: 'app'
  value: AppSettings
  updatedAt: string
}

export type DatabaseDirectory = {
  id: string
  name: string
  handle: FileSystemDirectoryHandle
  lastScannedAt: string | null
}

class LiberDatabase extends Dexie {
  books!: Table<DatabaseBook, string>
  volumes!: Table<DatabaseVolume, string>
  files!: Table<DatabaseFile, string>
  covers!: Table<DatabaseCover, string>
  progress!: Table<DatabaseProgress, string>
  settings!: Table<DatabaseSettings, string>
  directories!: Table<DatabaseDirectory, string>

  constructor() {
    super('liber')

    this.version(1).stores({
      books:
        'id,title,author,coverBlobId,dateAdded,dateModified,lastRead,missingFile',
      volumes:
        'id,&stableKey,bookId,number,[bookId+number],sourceFileHash,fileId,fileMissing',
      files: 'id,sha256,size',
      covers: 'id,size',
      progress: '&stableKey,bookId,volumeId,updatedAt',
      settings: '&key,updatedAt',
    })

    this.version(2)
      .stores({
        books:
          'id,title,author,seriesKey,coverBlobId,dateAdded,dateModified,lastRead,missingFile',
        volumes:
          'id,&stableKey,bookId,number,[bookId+number],sourceFileHash,fileId,fileMissing',
        files: 'id,sha256,size',
        covers: 'id,size',
        progress: '&stableKey,bookId,volumeId,updatedAt',
        settings: '&key,updatedAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table('books')
          .toCollection()
          .modify((book) => {
            const identity = `${book.author}\u0000${book.title}`
              .normalize('NFKC')
              .trim()
              .toLowerCase()
              .replace(/[^\p{L}\p{N}]+/gu, '-')
              .replace(/^-|-$/g, '')
            book.seriesKey = identity || 'unknown'
          })
        await transaction
          .table('volumes')
          .toCollection()
          .modify((volume) => {
            volume.toc ??= []
          })
        await transaction
          .table('covers')
          .toCollection()
          .modify((cover) => {
            cover.kind ??= 'custom'
          })
      })

    this.version(3)
      .stores({
        books:
          'id,title,author,seriesKey,coverBlobId,dateAdded,dateModified,lastRead,missingFile',
        volumes:
          'id,&stableKey,bookId,number,[bookId+number],sourceFileHash,fileId,fileMissing,[sourceDirectoryId+sourceRelativePath]',
        files: 'id,sha256,size',
        covers: 'id,size',
        progress: '&stableKey,bookId,volumeId,updatedAt',
        settings: '&key,updatedAt',
        directories: '&id,name,lastScannedAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table('settings')
          .toCollection()
          .modify((record) => {
            record.value.librarySort ??= 'date-added'
            record.value.readerFontSize ??= 1.125
            record.value.readerLineHeight ??= 1.9
            record.value.readerMargins ??= 1.5
          })
      })

    this.version(4)
      .stores({
        books:
          'id,title,author,seriesKey,coverBlobId,dateAdded,dateModified,lastRead,missingFile',
        volumes:
          'id,&stableKey,bookId,number,[bookId+number],sourceFileHash,fileId,fileMissing,[sourceDirectoryId+sourceRelativePath]',
        files: 'id,sha256,size',
        covers: 'id,size',
        progress: '&stableKey,bookId,volumeId,updatedAt',
        settings: '&key,updatedAt',
        directories: '&id,name,lastScannedAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table('settings')
          .toCollection()
          .modify((record) => {
            record.value.readerFontSize ??= 1.125
            record.value.readerLineHeight ??= 1.9
            record.value.readerMargins ??= 1.5
          })
      })

    this.version(5)
      .stores({
        books:
          'id,title,author,seriesKey,coverBlobId,dateAdded,dateModified,lastRead,missingFile',
        volumes:
          'id,&stableKey,bookId,number,[bookId+number],sourceFileHash,fileId,fileMissing,[sourceDirectoryId+sourceRelativePath]',
        files: 'id,sha256,size',
        covers: 'id,size',
        progress: '&stableKey,bookId,volumeId,updatedAt',
        settings: '&key,updatedAt',
        directories: '&id,name,lastScannedAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table('settings')
          .toCollection()
          .modify((record) => {
            if (
              ['System default', 'Clear', 'Warm'].includes(
                record.value.preferredVoice,
              )
            ) {
              record.value.preferredVoice = ''
            }
          })
      })
  }
}

export const db = new LiberDatabase()
