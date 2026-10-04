import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Table2 } from 'lucide-react'
import { Button, Card, DataTable, type DataTableColumn } from '@qvanderlinden/ui'
import { addMonthsFrom } from '../accountingDisplay'
import { eur, formatDate, formatNumber } from '../format'

export interface BalancePoint {
  date: string
  balance: number
}

interface BalanceChartProps {
  asOf: string
  startingBalance: number
  points: BalancePoint[]
  // Payment date of the account's next flow past `points`, if any - null
  // means nothing is scheduled beyond the plotted window at all.
  nextFlowDate: string | null
  // The plotted horizon, from asOf.
  windowMonths: number
  // Reports which entry of `points` the chart is showing (hovered or chosen
  // with the arrow keys; the last point by default), so the parent can list
  // that day's flows. Index is into `points` as passed in, not the chart's
  // internal allPoints (which prepends the asOf starting point).
  onHoverPointChange?: (index: number | null) => void
  // Rendered inside the chart's card, under the plot (the active day's flows).
  children?: ReactNode
}

const HEIGHT = 260
const PAD_LEFT = 64
const PAD_RIGHT = 16
const PAD_TOP = 16
const PAD_BOTTOM = 28

function parseLocalDate(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const normalized = rawStep / magnitude
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return niceNormalized * magnitude
}

function buildStepPath(coords: { x: number; y: number }[], rightEdgeX: number): string {
  if (coords.length === 0) return ''
  let d = `M ${coords[0].x} ${coords[0].y}`
  for (let i = 1; i < coords.length; i++) {
    d += ` L ${coords[i].x} ${coords[i - 1].y} L ${coords[i].x} ${coords[i].y}`
  }
  d += ` L ${rightEdgeX} ${coords[coords.length - 1].y}`
  return d
}

// Draws at the container's real pixel width so axis labels stay 10px.
function useContainerWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(Math.max(280, Math.round(el.clientWidth)))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

// fisac's own step chart (the system's LineChart has no hover callback),
// drawn with the system's chart tokens: series --chart-1, 9% grid, 10px mono
// axis labels, 10% area fill, negative zone in the rust status tone.
export function BalanceChart({
  asOf,
  startingBalance,
  points,
  nextFlowDate,
  windowMonths,
  onHoverPointChange,
  children,
}: BalanceChartProps) {
  const [containerRef, width] = useContainerWidth(900)
  const [selected, setSelected] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const allPoints = useMemo(
    () => [{ date: asOf, balance: startingBalance }, ...points],
    [asOf, startingBalance, points],
  )

  const plotWidth = width - PAD_LEFT - PAD_RIGHT
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM

  const times = useMemo(() => allPoints.map((p) => parseLocalDate(p.date)), [allPoints])
  const minTime = times[0]
  // The chart always spans the full selected window, even with no flows to
  // plot - otherwise it'd draw only as far out as the last known point.
  const horizonTime = useMemo(() => parseLocalDate(addMonthsFrom(asOf, windowMonths)), [asOf, windowMonths])
  const maxTime = Math.max(times[times.length - 1], horizonTime)
  const timeSpan = maxTime - minTime || 1

  const { yMin, yMax, yStep } = useMemo(() => {
    const balances = allPoints.map((p) => p.balance)
    const rawMin = Math.min(0, ...balances)
    const rawMax = Math.max(0, ...balances)
    const step = niceStep((rawMax - rawMin || 1) / 4)
    return {
      yMin: Math.floor(rawMin / step) * step,
      yMax: Math.ceil(rawMax / step) * step,
      yStep: step,
    }
  }, [allPoints])
  const yRange = yMax - yMin || 1

  function x(time: number): number {
    return PAD_LEFT + ((time - minTime) / timeSpan) * plotWidth
  }
  function y(balance: number): number {
    return PAD_TOP + plotHeight - ((balance - yMin) / yRange) * plotHeight
  }

  const coords = allPoints.map((p, i) => ({ x: x(times[i]), y: y(p.balance) }))
  const rightEdgeX = PAD_LEFT + plotWidth
  const yZero = y(0)
  const showZeroBaseline = yMin < 0 && yMax > 0

  const gridlineValues: number[] = []
  for (let v = yMin; v <= yMax + 1e-9; v += yStep) {
    gridlineValues.push(Math.round(v * 100) / 100)
  }

  // Fewer date labels on narrow screens so they never overlap.
  const xTickCount = Math.max(2, Math.min(6, Math.floor(plotWidth / 110)))
  const xTicks = useMemo(() => {
    const ticks: number[] = []
    for (let i = 0; i < xTickCount; i++) {
      ticks.push(minTime + (timeSpan * i) / (xTickCount - 1))
    }
    return ticks
  }, [minTime, timeSpan, xTickCount])

  // The muted tail only applies when nothing is scheduled beyond the window
  // at all (nextFlowDate null). A quiet stretch followed by real flows just
  // past the window is not a gap in our knowledge, so it keeps its colour.
  const hasForecastGap = nextFlowDate === null && maxTime > times[times.length - 1]

  // A different series (a deleted batch, a wider window) can put the same
  // index on another day, so the choice starts over; a refetch with the same
  // dates (a paid toggle, an amount edit) keeps the chosen day.
  const seriesKey = points.map((p) => p.date).join(',')
  useEffect(() => {
    setSelected(null)
  }, [seriesKey])

  // Clamped too: for the render before that reset lands, a stale index must
  // not point past the end of a shorter series.
  const activeIndex = selected !== null && selected < allPoints.length ? selected : allPoints.length - 1
  const active = allPoints[activeIndex]
  // allPoints[0] is the synthetic asOf entry, with no flows of its own.
  const activePointIndex = activeIndex > 0 ? activeIndex - 1 : null

  useEffect(() => {
    onHoverPointChange?.(activePointIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePointIndex])

  function onKeyDown(e: React.KeyboardEvent<SVGSVGElement>) {
    const last = allPoints.length - 1
    const next =
      e.key === 'ArrowLeft'
        ? Math.max(0, activeIndex - 1)
        : e.key === 'ArrowRight'
          ? Math.min(last, activeIndex + 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null
    if (next === null) return
    e.preventDefault()
    setSelected(next)
  }

  const tableColumns: DataTableColumn<BalancePoint & { id: number }>[] = [
    { key: 'date', header: 'date', render: (_, row) => <span className="numeric">{formatDate(row.date, 'full')}</span> },
    { key: 'balance', header: 'solde', numeric: true, render: (_, row) => eur(row.balance) },
  ]

  return (
    <Card
      title="Solde projeté"
      subtitle={
        active ? (
          <span aria-live="polite">
            <span className="numeric text-fg-strong">{eur(active.balance)}</span> au{' '}
            <span className="numeric">{formatDate(active.date, 'full')}</span>
          </span>
        ) : null
      }
      actions={
        <Button variant="ghost" size="sm" iconLeft={Table2} onClick={() => setShowTable((v) => !v)}>
          {showTable ? 'Masquer le tableau' : 'Voir en tableau'}
        </Button>
      }
      padding={false}
    >
      <div className="px-2 pb-2">
        <div ref={containerRef}>
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            className="block max-w-full"
            role="group"
            aria-label="Solde projeté jour par jour ; flèches gauche et droite pour parcourir les jours"
            tabIndex={0}
            onKeyDown={onKeyDown}
          >
            {gridlineValues.map((value) => {
              const gy = y(value)
              return (
                <g key={value}>
                  <line
                    x1={PAD_LEFT}
                    x2={width - PAD_RIGHT}
                    y1={gy}
                    y2={gy}
                    className={value === 0 && showZeroBaseline ? 'stroke-chart-axis' : 'stroke-chart-grid'}
                  />
                  <text
                    x={PAD_LEFT - 8}
                    y={gy}
                    textAnchor="end"
                    dy="0.32em"
                    className="fill-chart-axis font-mono text-[10px]"
                  >
                    {formatNumber(Math.round(value))}
                  </text>
                </g>
              )
            })}

            {xTicks.map((tick, i) => (
              <text
                key={tick}
                x={x(tick)}
                y={HEIGHT - PAD_BOTTOM + 18}
                textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                className="fill-chart-axis font-mono text-[10px]"
              >
                {formatDate(new Date(tick))}
              </text>
            ))}

            {coords.map((point, i) => {
              const nextX = i < coords.length - 1 ? coords[i + 1].x : rightEdgeX
              const isForecastGap = i === coords.length - 1 && hasForecastGap
              const isPositive = allPoints[i].balance >= 0
              return (
                <rect
                  key={`area-${i}`}
                  x={point.x}
                  y={Math.min(point.y, yZero)}
                  width={Math.max(nextX - point.x, 0)}
                  height={Math.abs(point.y - yZero)}
                  className={isForecastGap ? 'fill-chart-6/10' : isPositive ? 'fill-chart-1/10' : 'fill-negative/10'}
                />
              )
            })}

            <path
              d={buildStepPath(coords, rightEdgeX)}
              fill="none"
              strokeWidth={2}
              className="stroke-chart-1"
            />

            {coords.map((point, i) => {
              const nextX = i < coords.length - 1 ? coords[i + 1].x : rightEdgeX
              return (
                <rect
                  key={`hit-${i}`}
                  x={point.x}
                  y={PAD_TOP}
                  width={Math.max(nextX - point.x, 1)}
                  height={plotHeight}
                  fill="transparent"
                  onPointerEnter={() => setSelected(i)}
                  onPointerDown={() => setSelected(i)}
                />
              )
            })}

            {selected !== null && coords[activeIndex] && (
              <line
                x1={coords[activeIndex].x}
                x2={coords[activeIndex].x}
                y1={PAD_TOP}
                y2={PAD_TOP + plotHeight}
                strokeDasharray="3 3"
                className="stroke-line-strong"
              />
            )}
          </svg>
        </div>
      </div>

      {children}

      {showTable && (
        <div className="border-t border-line-hairline">
          <DataTable
            compact
            columns={tableColumns}
            // Index as id: the asOf point can share its date with the first
            // real point when a flow lands today.
            rows={allPoints.map((p, i) => ({ ...p, id: i }))}
          />
        </div>
      )}
    </Card>
  )
}
