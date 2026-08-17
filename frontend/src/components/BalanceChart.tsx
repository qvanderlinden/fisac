import { useEffect, useMemo, useState } from 'react'
import { formatDate } from '../accountingDisplay'

export interface BalancePoint {
  date: string
  balance: number
}

export interface WindowOption {
  label: string
  months: number
}

interface BalanceChartProps {
  asOf: string
  startingBalance: number
  points: BalancePoint[]
  windowOptions: WindowOption[]
  selectedWindowMonths: number
  onWindowChange: (months: number) => void
  // Reports which entry of `points` the chart is currently showing (hovered,
  // or the last point by default - see activePointIndex below), so a parent
  // can render that day's flows. Index is into `points` as passed in, not
  // the chart's internal allPoints (which prepends the asOf starting point).
  onHoverPointChange?: (index: number | null) => void
}

// Wider, shorter-relative-height aspect ratio than a mobile chart would use
// (roughly 3.4:1) - this is viewBox-scaled to 100% of its container width
// (see .balance-chart svg), so the constants mainly set proportions/internal
// coordinate precision, not literal on-screen pixels.
const WIDTH = 980
const HEIGHT = 290
const PAD_LEFT = 68
const PAD_RIGHT = 16
const PAD_TOP = 20
const PAD_BOTTOM = 32
const MIN_SPAN_MS = 90 * 24 * 60 * 60 * 1000 // 90 days, so a sparsely-populated account still draws a real chart

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

function formatAxisValue(value: number): string {
  return Math.round(value).toLocaleString()
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

export function BalanceChart({
  asOf,
  startingBalance,
  points,
  windowOptions,
  selectedWindowMonths,
  onWindowChange,
  onHoverPointChange,
}: BalanceChartProps) {
  const [selected, setSelected] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const allPoints = useMemo(
    () => [{ date: asOf, balance: startingBalance }, ...points],
    [asOf, startingBalance, points],
  )

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM

  const times = useMemo(() => allPoints.map((p) => parseLocalDate(p.date)), [allPoints])
  const minTime = times[0]
  const maxTime = Math.max(times[times.length - 1], minTime + MIN_SPAN_MS)
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

  const activeIndex = selected ?? allPoints.length - 1
  const active = allPoints[activeIndex]
  // allPoints[0] is the synthetic asOf/startingBalance entry prepended above,
  // so it has no corresponding entry (and no flows) in the caller's `points`.
  const activePointIndex = activeIndex > 0 ? activeIndex - 1 : null

  useEffect(() => {
    onHoverPointChange?.(activePointIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePointIndex])

  return (
    <div className="viz-root balance-chart">
      <div className="chart-header">
        <h3>Projected balance</h3>
        {active && (
          <p className="chart-readout">
            <strong>{formatAxisValue(active.balance)}</strong>{' '}
            <span className="text-secondary">at {formatDate(active.date)}</span>
          </p>
        )}
      </div>

      <div className="chart-toolbar">
        <div className="window-selector">
          {windowOptions.map((option) => (
            <button
              key={option.months}
              type="button"
              className={option.months === selectedWindowMonths ? 'selected' : ''}
              onClick={() => onWindowChange(option.months)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Line chart of projected account balance over time"
      >
        {gridlineValues.map((value) => {
          const gy = y(value)
          return (
            <g key={value}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={gy}
                y2={gy}
                className={value === 0 && showZeroBaseline ? 'baseline' : 'gridline'}
              />
              <text x={PAD_LEFT - 8} y={gy} className="axis-label" textAnchor="end" dy="0.32em">
                {formatAxisValue(value)}
              </text>
            </g>
          )
        })}

        {coords.map((point, i) => {
          const nextX = i < coords.length - 1 ? coords[i + 1].x : rightEdgeX
          const isPositive = allPoints[i].balance >= 0
          return (
            <rect
              key={`area-${i}`}
              x={point.x}
              y={Math.min(point.y, yZero)}
              width={Math.max(nextX - point.x, 0)}
              height={Math.abs(point.y - yZero)}
              className={isPositive ? 'balance-area-positive' : 'balance-area-negative'}
            />
          )
        })}

        <path d={buildStepPath(coords, rightEdgeX)} className="balance-line" />

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
              onFocus={() => setSelected(i)}
              tabIndex={0}
              aria-label={`${formatAxisValue(allPoints[i].balance)} at ${formatDate(allPoints[i].date)}`}
            />
          )
        })}

        {selected !== null && (
          <line
            x1={coords[selected].x}
            x2={coords[selected].x}
            y1={PAD_TOP}
            y2={PAD_TOP + plotHeight}
            className="crosshair"
          />
        )}
      </svg>

      <button className="btn-link" onClick={() => setShowTable((v) => !v)}>
        {showTable ? 'Hide table' : 'Show as table'}
      </button>

      {showTable && (
        <table className="chart-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {allPoints.map((point, i) => (
              // Index included: the synthetic starting point (asOf) can share
              // its date with the first real point, when a flow lands today.
              <tr key={`${point.date}-${i}`}>
                <td>{formatDate(point.date)}</td>
                <td>{formatAxisValue(point.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
