import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/ui/Button.tsx'
import { ProgressBar } from '../../components/ui/ProgressBar.tsx'
import { Skeleton } from '../../components/ui/Skeleton.tsx'
import { useLibrary } from '../library/useLibrary.ts'
import type { Book } from '../../data/mockBooks.ts'

const volumeNumberFormat = new Intl.NumberFormat(undefined, {
  minimumIntegerDigits: 2,
})

function getOverallProgress(book: Book) {
  if (book.volumes.length === 0) return 0
  const progressTotal = book.volumes.reduce(
    (total, volume) => total + volume.progress,
    0,
  )
  return Math.round(progressTotal / book.volumes.length)
}

function BookDetailSkeleton() {
  return (
    <div className="book-detail-skeleton" aria-label="Loading book detail">
      <div className="book-detail-skeleton__overview">
        <Skeleton variant="block" className="book-detail-skeleton__cover" />
        <div className="book-detail-skeleton__metadata">
          <Skeleton variant="text" width="78%" height="2rem" />
          <Skeleton variant="text" width="42%" />
          <Skeleton variant="text" width="8rem" height="1.5rem" />
          <Skeleton variant="block" width="100%" height="0.5rem" />
        </div>
      </div>
      <div className="book-detail-skeleton__volumes">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="book-detail-skeleton__row" key={index}>
            <div>
              <Skeleton variant="text" width="5rem" />
              <Skeleton variant="text" width="12rem" />
            </div>
            <Skeleton variant="block" width="7rem" height="3rem" />
          </div>
        ))}
      </div>
    </div>
  )
}

function BookDetails({ book }: { book: Book }) {
  const navigate = useNavigate()
  const totalVolumes = book.volumes.length
  const overallProgress = getOverallProgress(book)
  const orderedVolumes = [...book.volumes].sort(
    (first, second) => first.number - second.number,
  )
  const displayTitle = book.title?.trim() || 'Untitled book'
  const displayAuthor = book.author?.trim() || 'Unknown author'

  return (
    <>
      <header className="book-detail__overview">
        <div className="book-detail__cover-wrap">
          <img
            className="book-detail__cover"
            src={book.coverUrl}
            alt={`Cover of ${displayTitle}`}
            width="240"
            height="360"
          />
        </div>
        <div className="book-detail__metadata">
          <h1 className="book-detail__title">{displayTitle}</h1>
          <p className="book-detail__author">{displayAuthor}</p>
          <p className="book-detail__volume-count">
            {totalVolumes} {totalVolumes === 1 ? 'volume' : 'volumes'}
          </p>
          <ProgressBar
            value={overallProgress}
            label={`${displayTitle} overall progress`}
            showValue
            className="book-detail__overall-progress"
          />
        </div>
      </header>

      <section
        className="book-detail__volumes"
        aria-labelledby="book-volumes-title"
      >
        <h2 id="book-volumes-title" className="book-detail__section-title">
          Volumes
        </h2>
        <ol className="book-volume-list">
          {orderedVolumes.map((volume) => {
            const destination = `/read/${book.id}/${volume.number}`
            const action = volume.progress > 0 ? 'Continue' : 'Start'

            return (
              <li className="book-volume" key={volume.number}>
                <Link className="book-volume__details" to={destination}>
                  <span className="book-volume__number">
                    Vol. {volumeNumberFormat.format(volume.number)}
                  </span>
                  <span className="book-volume__title">
                    {volume.title?.trim() || `Volume ${volume.number}`}
                  </span>
                  <span className="book-volume__progress">
                    <ProgressBar
                      value={volume.progress}
                      label={`${volume.title} progress`}
                      showValue
                    />
                  </span>
                </Link>
                <Button
                  type="button"
                  variant={volume.progress > 0 ? 'secondary' : 'primary'}
                  size={volume.progress > 0 ? 'normal' : 'large'}
                  className="book-volume__action"
                  onClick={() => navigate(destination)}
                >
                  {action}
                  <ArrowRight size={17} aria-hidden="true" />
                </Button>
              </li>
            )
          })}
        </ol>
      </section>
    </>
  )
}

export function BookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const library = useLibrary()
  const [resolvedId, setResolvedId] = useState<string | null>(null)
  const book = library.find((candidate) => candidate.id === id)

  useEffect(() => {
    if (!id) return

    const timeout = window.setTimeout(() => setResolvedId(id), 180)
    return () => window.clearTimeout(timeout)
  }, [id])

  const isLoading = resolvedId !== id

  return (
    <main className="book-detail">
      <Button
        type="button"
        variant="ghost"
        className="book-detail__back"
        onClick={() => navigate('/')}
      >
        <ArrowLeft size={17} aria-hidden="true" />
        Back to Library
      </Button>

      {isLoading ? (
        <BookDetailSkeleton />
      ) : book ? (
        <BookDetails book={book} />
      ) : (
        <section className="book-detail__not-found">
          <h1 className="book-detail__title">Book not found</h1>
          <p className="book-detail__author">
            This book is not in your library.
          </p>
        </section>
      )}
    </main>
  )
}
