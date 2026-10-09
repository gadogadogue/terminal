/**
 * Categorical series colors. The order is the colorblind-safety mechanism:
 * every adjacent pair was validated for CVD separation on the card surface
 * (#ffffff light, #171717 dark). Don't reorder or append; eight is the cap.
 * Three light-mode slots sit under 3:1 contrast, so identity never relies on
 * color alone: the legend and metrics table always name each series.
 */
export const SERIES_COLORS = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
} as const

export const CHART_CHROME = {
  light: { text: "#737373", grid: "#f0f0f0", baseline: "#cccccc", crosshair: "#a1a1a1", surface: "#ffffff" },
  dark: { text: "#a1a1a1", grid: "#262626", baseline: "#525252", crosshair: "#737373", surface: "#171717" },
} as const

export type ChartTheme = keyof typeof SERIES_COLORS

export function seriesColor(slot: number, theme: ChartTheme): string {
  return SERIES_COLORS[theme][slot % SERIES_COLORS[theme].length]
}
