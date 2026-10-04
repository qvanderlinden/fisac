import { formatNumber } from '../format'

/** A count and its noun, with the figure in the numeric face: `<CountLabel n={3} singular="flux" plural="flux" />`. */
export function CountLabel({ n, singular, plural }: { n: number; singular: string; plural: string }) {
  return (
    <>
      <span className="numeric">{formatNumber(n)}</span> {n > 1 ? plural : singular}
    </>
  )
}
