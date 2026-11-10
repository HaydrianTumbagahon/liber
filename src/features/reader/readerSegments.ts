import type { DatabaseVolume } from '../../data/database.ts'
import type { ReaderBookSnapshot } from './useReaderBook.ts'

export type ReaderChapterSegment = {
  kind: 'chapter'
  id: string
  volumeId: string
  volumeNumber: number
  volumeTitle: string
  chapterIndex: number
  href: string
  title: string
}

export type ReaderVolumeEndSegment = {
  kind: 'volume-end'
  id: string
  volumeId: string
  volumeNumber: number
  volumeTitle: string
  nextVolumeNumber: number | null
  nextVolumeTitle: string | null
  nextPreviewId: string | null
}

export type ReaderSegment = ReaderChapterSegment | ReaderVolumeEndSegment

function titleFromHref(href: string) {
  const name = decodeURIComponent(href.split('/').pop() ?? href)
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') || 'Chapter'
}

function getVolumeChapters(volume: DatabaseVolume) {
  const spineByHref = new Map(
    volume.spineIndex.map((entry) => [entry.href.split(/[?#]/, 1)[0], entry]),
  )
  const toc = volume.toc
    .filter((entry) => spineByHref.has(entry.href.split(/[?#]/, 1)[0]))
    .map((entry) => ({ href: entry.href, title: entry.title }))
  const entries =
    toc.length > 0
      ? toc
      : volume.spineIndex.map((entry) => ({
          href: entry.href,
          title: titleFromHref(entry.href),
        }))
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (seen.has(entry.href)) return false
    seen.add(entry.href)
    return true
  })
}

export function buildReaderSegments(
  snapshot: ReaderBookSnapshot,
  startVolumeNumber: number,
): readonly ReaderSegment[] {
  const volumes = snapshot.volumes
    .filter(({ volume }) => volume.number >= startVolumeNumber)
    .sort((first, second) => first.volume.number - second.volume.number)

  return volumes.flatMap(({ volume }, volumeIndex) => {
    const nextVolume = volumes[volumeIndex + 1]?.volume
    const chapters = getVolumeChapters(volume)
    const chapterSegments: ReaderSegment[] = chapters.map((chapter, index) => ({
      kind: 'chapter',
      id: `${volume.id}-chapter-${index}`,
      volumeId: volume.id,
      volumeNumber: volume.number,
      volumeTitle: volume.title,
      chapterIndex: index,
      href: chapter.href,
      title: chapter.title,
    }))

    chapterSegments.push({
      kind: 'volume-end',
      id: `${volume.id}-end`,
      volumeId: volume.id,
      volumeNumber: volume.number,
      volumeTitle: volume.title,
      nextVolumeNumber: nextVolume?.number ?? null,
      nextVolumeTitle: nextVolume?.title ?? null,
      nextPreviewId:
        nextVolume && getVolumeChapters(nextVolume).length > 0
          ? `${nextVolume.id}-chapter-0`
          : null,
    })
    return chapterSegments
  })
}
