import type { CloseZoneStyle, GridStyle } from './types'

export const GRID_PADDING = 12
export const PAGE_DOTS_HEIGHT = 18

export const DEFAULT_HOTKEY = 'Control+Alt+Space'
export const DEFAULT_COLS = 3
export const DEFAULT_ROWS = 2

export const DEFAULT_GRID_STYLE: GridStyle = {
  cellWidth: 110,
  cellHeight: 80,
  gap: 8,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: '#4b4b58'
}

export const GRID_STYLE_LIMITS = {
  cellWidth: { min: 60, max: 220 },
  cellHeight: { min: 40, max: 180 },
  gap: { min: 0, max: 32 },
  borderRadius: { min: 0, max: 40 },
  borderWidth: { min: 0, max: 8 }
}

export const DEFAULT_CLOSE_ZONE: CloseZoneStyle = { margin: 60, visual: 'fill', opacity: 0.15 }

export const CLOSE_ZONE_LIMITS = {
  margin: { min: 0, max: 300 },
  opacity: { min: 0, max: 1 }
}

/** Size of just the button grid's own content box (what GridCells actually fills). */
export function gridContentSize(
  cols: number,
  rows: number,
  style: GridStyle
): { width: number; height: number } {
  return {
    width: cols * style.cellWidth + (cols - 1) * style.gap + GRID_PADDING * 2,
    height: rows * style.cellHeight + (rows - 1) * style.gap + GRID_PADDING * 2
  }
}

/** Size of the whole overlay window: the grid content, the page-dots strip if shown, and the
 *  hover-out-to-close margin around the outside. */
export function overlaySize(
  cols: number,
  rows: number,
  style: GridStyle,
  showPageDots: boolean,
  closeZone: CloseZoneStyle
): { width: number; height: number } {
  const content = gridContentSize(cols, rows, style)
  const height = content.height + (showPageDots ? PAGE_DOTS_HEIGHT : 0)
  return {
    width: content.width + closeZone.margin * 2,
    height: height + closeZone.margin * 2
  }
}
