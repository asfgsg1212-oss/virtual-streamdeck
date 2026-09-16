import type { DeckButton, GridStyle } from '@shared/types'
import { GRID_PADDING } from '@shared/constants'
import './gridCells.css'

interface Props {
  cols: number
  rows: number
  style: GridStyle
  buttons: (DeckButton | null)[]
  onCellClick?: (index: number, button: DeckButton | null) => void
  /** Extra space (px) to reserve below the grid, e.g. for a page-dots strip. */
  bottomReserved?: number
}

/**
 * Renders the actual button grid — used by the real overlay AND by the settings preview,
 * so "what you configure" and "what pops up" can never visually drift apart.
 */
export default function GridCells(props: Props): React.JSX.Element {
  const { style } = props
  const iconSize = Math.max(14, Math.min(36, style.cellHeight * 0.42))
  const cellPadding = Math.max(2, Math.min(6, style.cellHeight * 0.12))

  return (
    <div
      className="grid-cells"
      style={{
        gridTemplateColumns: `repeat(${props.cols}, 1fr)`,
        gridTemplateRows: `repeat(${props.rows}, 1fr)`,
        gap: style.gap,
        padding: GRID_PADDING,
        height: props.bottomReserved ? `calc(100% - ${props.bottomReserved}px)` : '100%'
      }}
    >
      {Array.from({ length: props.cols * props.rows }).map((_, i) => {
        const btn = props.buttons[i] ?? null
        const fill = btn?.iconMode === 'fill'
        const cellStyle = {
          borderRadius: style.borderRadius,
          borderWidth: style.borderWidth,
          borderColor: btn?.color || style.borderColor,
          padding: fill ? 0 : cellPadding
        }
        const onClick = props.onCellClick ? () => props.onCellClick!(i, btn) : undefined
        if (!btn) {
          return (
            <div
              key={i}
              className="grid-cell grid-cell--empty"
              style={cellStyle}
              onClick={onClick}
            />
          )
        }
        return (
          <button
            key={btn.id}
            type="button"
            className={`grid-cell ${fill ? 'grid-cell--fill' : ''}`}
            style={cellStyle}
            onClick={onClick}
          >
            {btn.icon ? (
              <img
                src={btn.icon}
                alt=""
                className={`grid-cell-icon ${fill ? 'grid-cell-icon--fill' : ''}`}
                style={fill ? { borderRadius: style.borderRadius } : { width: iconSize, height: iconSize }}
                draggable={false}
              />
            ) : (
              <span
                className={`grid-cell-glyph ${fill ? 'grid-cell-glyph--fill' : ''}`}
                style={{
                  fontSize: fill ? '38%' : iconSize * 0.65,
                  background: btn.color,
                  borderRadius: fill ? style.borderRadius : undefined
                }}
              >
                {btn.label.slice(0, 1) || '•'}
              </span>
            )}
            {!fill && <span className="grid-cell-label">{btn.label}</span>}
          </button>
        )
      })}
    </div>
  )
}
