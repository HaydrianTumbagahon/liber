import { Button } from '../../components/ui/Button.tsx'
import { motion } from 'framer-motion'
import { useReducedMotion } from 'framer-motion'

export const ADD_BOOKS_MODAL_LAYOUT_ID = 'add-books-modal'

export function EmptyLibraryState({
  onAddBooks,
  folderStorage = false,
}: {
  onAddBooks: () => void
  folderStorage?: boolean
}) {
  const reduceMotion = useReducedMotion()

  return (
    <section className="library-empty" aria-labelledby="library-empty-title">
      <svg
        className="library-empty__art"
        viewBox="0 0 220 160"
        role="img"
        aria-label="Geometric open book illustration"
      >
        <path
          d="M22 126h176"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <path
          d="M38 52c26-9 49-6 72 8v62c-23-14-46-17-72-8z"
          fill="var(--bg)"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M182 52c-26-9-49-6-72 8v62c23-14 46-17 72-8z"
          fill="var(--bg)"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path d="M110 60v62" stroke="var(--accent)" strokeWidth="3" />
        <circle cx="174" cy="30" r="11" fill="var(--accent)" />
        <path
          d="M34 34h27M47.5 20.5v27"
          stroke="currentColor"
          strokeWidth="2"
        />
        <path
          d="M54 77c14-4 27-3 40 2M54 91c14-4 27-3 40 2"
          stroke="var(--border-color)"
          strokeWidth="2"
        />
        <path
          d="M126 79c13-5 26-6 40-2M126 93c13-5 26-6 40-2"
          stroke="var(--border-color)"
          strokeWidth="2"
        />
      </svg>
      <h2 id="library-empty-title" className="library-empty__title">
        Your library is empty
      </h2>
      <p className="library-empty__prompt">
        {folderStorage
          ? 'Copy book folders into liber/library/ or use Add Books, then select Resync.'
          : 'Add your first light novel'}
      </p>
      <Button
        variant="primary"
        size="large"
        whileTap={undefined}
        onClick={onAddBooks}
      >
        {!reduceMotion && (
          <motion.span
            className="library-add-morph"
            layoutId={ADD_BOOKS_MODAL_LAYOUT_ID}
            aria-hidden="true"
          />
        )}
        <span className="library-empty__add-label">Choose an EPUB</span>
      </Button>
    </section>
  )
}
