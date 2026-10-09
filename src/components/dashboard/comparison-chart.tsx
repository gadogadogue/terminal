"use client"

import {
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  TickMarkType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts"
import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { CHART_CHROME, type ChartTheme } from "@/lib/chart-palette"
import type { LineDash } from "@/lib/instruments"
import { formatChange, formatDate } from "@/lib/format"
import type { PricePoint } from "@/lib/providers/types"
import { LineKey } from "./line-key"

export interface ChartLine {
  key: string
  label: string
  color: string
  dash: LineDash
  /** Percent change from the common start. */
  points: PricePoint[]
}

// Plain Dotted is 1px on, 1px off at our 1px width and reads as a faint solid line.
const LINE_STYLES: Record<LineDash, LineStyle> = {
  solid: LineStyle.Solid,
  dashed: LineStyle.Dashed,
  dotted: LineStyle.SparseDotted,
}

const axisFormat = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(Math.abs(v) >= 100 ? 0 : 1)}%`

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Year ticks as "2026", month ticks as "Apr", day ticks as "9 Apr" (never a bare "9"). */
function tickFormat(time: Time, type: TickMarkType): string {
  const iso = toISO(time)
  if (!iso) return ""
  const [year, month, day] = iso.split("-").map(Number)
  if (type === TickMarkType.Year) return String(year)
  if (type === TickMarkType.Month) return MONTHS[month - 1]
  return `${day} ${MONTHS[month - 1]}`
}

/** lightweight-charts hands back times in a few shapes; normalize to YYYY-MM-DD. */
function toISO(time: Time | undefined): string | null {
  if (time == null) return null
  if (typeof time === "string") return time
  if (typeof time === "number") return new Date(time * 1000).toISOString().slice(0, 10)
  return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`
}

/**
 * Shows all data and hands the y-axis back to auto-scaling. Dragging the
 * price axis turns auto-scaling off for good, so a reset must turn it back on.
 */
function resetView(chart: IChartApi) {
  chart.priceScale("right").applyOptions({ autoScale: true })
  chart.timeScale().fitContent()
}

function samePoints(a: PricePoint[] | undefined, b: PricePoint[]): boolean {
  if (a === b) return true
  if (!a || a.length !== b.length) return false
  return a.every((p, i) => p.time === b[i].time && p.value === b[i].value)
}

/** Value on `time`, or the latest before it, since holidays differ between markets. */
function valueAt(points: PricePoint[], time: string): number | null {
  let lo = 0
  let hi = points.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].time <= time) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found === -1 ? null : points[found].value
}

export function ComparisonChart({
  lines,
  theme,
  stale,
  viewKey,
  className,
}: {
  lines: ChartLine[]
  theme: ChartTheme
  /** Data is reloading: keep the current frame and dim it. */
  stale: boolean
  /** Changes whenever a range is picked, even the current one: reset the view. */
  viewKey: number
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef(new Map<string, ISeriesApi<"Line">>())
  /** Points last handed to each series, to tell data changes from style changes. */
  const dataRef = useRef(new Map<string, PricePoint[]>())
  const baselineRef = useRef<ISeriesApi<"Line"> | null>(null)
  const themeRef = useRef(theme)
  const [hoverTime, setHoverTime] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current!
    const series = seriesRef.current
    const data = dataRef.current
    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        fontFamily: getComputedStyle(container).fontFamily,
        fontSize: 12,
      },
      grid: { vertLines: { visible: false }, horzLines: { style: LineStyle.Solid } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, tickMarkFormatter: tickFormat },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { width: 1, style: LineStyle.Solid },
        horzLine: { visible: false, labelVisible: false },
      },
      localization: { priceFormatter: axisFormat, dateFormat: "dd MMM yyyy" },
    })
    chartRef.current = chart
    // A hairline at 0% so gains and losses read against the starting point.
    baselineRef.current = chart.addSeries(LineSeries, {
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    })

    const onMove = (param: MouseEventParams<Time>) => setHoverTime(param.point ? toISO(param.time) : null)
    chart.subscribeCrosshairMove(onMove)
    return () => {
      chart.unsubscribeCrosshairMove(onMove)
      chart.remove()
      chartRef.current = null
      baselineRef.current = null
      series.clear()
      data.clear()
    }
  }, [])

  useEffect(() => {
    themeRef.current = theme
    const c = CHART_CHROME[theme]
    chartRef.current?.applyOptions({
      layout: { textColor: c.text },
      grid: { horzLines: { color: c.grid } },
      crosshair: { vertLine: { color: c.crosshair, labelBackgroundColor: theme === "dark" ? "#404040" : "#0a0a0a" } },
    })
    baselineRef.current?.applyOptions({ color: c.baseline })
    for (const s of seriesRef.current.values()) s.applyOptions({ crosshairMarkerBorderColor: c.surface })
  }, [theme])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || stale) return
    const map = seriesRef.current
    const data = dataRef.current
    const keep = new Set(lines.map((l) => l.key))
    // Only new data resets the view; a color or dash change keeps the zoom.
    let dataChanged = false
    for (const [key, s] of map) {
      if (!keep.has(key)) {
        chart.removeSeries(s)
        map.delete(key)
        data.delete(key)
        dataChanged = true
      }
    }

    // Direct end-labels on the axis only while there are few enough not to collide.
    const lastValueVisible = lines.length <= 4
    let first: string | null = null
    let last: string | null = null
    for (const line of lines) {
      const options = {
        color: line.color,
        lineStyle: LINE_STYLES[line.dash],
        lastValueVisible,
      }
      let s = map.get(line.key)
      if (!s) {
        s = chart.addSeries(LineSeries, {
          ...options,
          lineWidth: 1,
          priceLineVisible: false,
          crosshairMarkerRadius: 4,
          crosshairMarkerBorderWidth: 2,
          crosshairMarkerBorderColor: CHART_CHROME[themeRef.current].surface,
        })
        map.set(line.key, s)
      } else {
        s.applyOptions(options)
      }
      if (!samePoints(data.get(line.key), line.points)) {
        s.setData(line.points.map((p) => ({ time: p.time as Time, value: p.value })))
        data.set(line.key, line.points)
        dataChanged = true
      }
      if (line.points.length) {
        if (!first || line.points[0].time < first) first = line.points[0].time
        const end = line.points[line.points.length - 1].time
        if (!last || end > last) last = end
      }
    }
    if (!dataChanged) return
    baselineRef.current?.setData(
      first && last && first !== last
        ? [
            { time: first as Time, value: 0 },
            { time: last as Time, value: 0 },
          ]
        : [],
    )
    resetView(chart)
  }, [lines, stale])

  useEffect(() => {
    if (chartRef.current) resetView(chartRef.current)
  }, [viewKey])

  const latest = lines.reduce<string | null>((max, l) => {
    const end = l.points.at(-1)?.time ?? null
    return end && (!max || end > max) ? end : max
  }, null)
  const shownTime = hoverTime ?? latest

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex min-h-10 flex-wrap items-start gap-x-5 gap-y-1.5">
        {lines.map((line) => (
          <div key={line.key} className="flex items-center gap-1.5 text-xs">
            <LineKey color={line.color} dash={line.dash} />
            <span className="font-medium tabular-nums text-foreground">
              {formatChange(shownTime ? valueAt(line.points, shownTime) : null)}
            </span>
            <span className="max-w-56 truncate text-muted-foreground" title={line.label}>
              {line.label}
            </span>
          </div>
        ))}
        {shownTime && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">{formatDate(shownTime)}</span>
        )}
      </div>
      <div
        ref={containerRef}
        role="img"
        aria-label={`Percent change of ${lines.length} series; values are listed in the table below.`}
        className={cn("h-[360px] w-full transition-opacity sm:h-[420px]", stale && "opacity-50")}
      />
    </div>
  )
}
