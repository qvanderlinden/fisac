import { formatNumber, pluralNoun } from '../format'

/**
 * A count and its noun with the figure in the numeric face. The plural rule is
 * `countLabel`'s (shared through `pluralNoun`), so the two cannot drift.
 */
export function CountFigure({ n, singular, plural }: { n: number; singular: string; plural: string }) {
  return (
    <>
      <span className="numeric">{formatNumber(n)}</span> {pluralNoun(n, singular, plural)}
    </>
  )
}
