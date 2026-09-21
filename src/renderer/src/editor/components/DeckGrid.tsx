import { useState } from 'react'
import type { DeckButton } from '@shared/types'

interface Props {
  cols: number
  rows: number
  buttons: (DeckButton | null)[]
  /** Edit mode: cells open the editor and can be dragged around. Otherwise a filled cell just runs. */
  editing: boolean
  onCellClick: (index: number) => void
  onSwap: (a: number, b: number) => void
}

export default function DeckGrid(props: Props): React.JSX.Element {
  const [dragOver, setDragOver] = useState<number | null>(null)

  return (
    <div
      className="deck-grid"
      style={{
        gridTemplateColumns: `repeat(${props.cols}, 132px)`,
        gridTemplateRows: `repeat(${props.rows}, 96px)`
      }}
    >
      {Array.from({ length: props.cols * props.rows }).map((_, i) => {
        const btn = props.buttons[i] ?? null
        return (
          <div
            key={i}
            className={`deck-cell ${btn ? '' : 'deck-cell--empty'} ${dragOver === i ? 'is-drop-target' : ''} ${props.editing ? '' : 'deck-cell--use'}`}
            draggable={props.editing && !!btn}
            onClick={() => props.onCellClick(i)}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', String(i))
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(i)
            }}
            onDragLeave={() => setDragOver((cur) => (cur === i ? null : cur))}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(null)
              const from = Number(e.dataTransfer.getData('text/plain'))
              if (props.editing && !Number.isNaN(from) && from !== i) props.onSwap(from, i)
            }}
          >
            {btn ? (
              <>
                {btn.icon ? (
                  <img src={btn.icon} alt="" className="deck-cell-icon" draggable={false} />
                ) : (
                  <span className="deck-cell-glyph" style={{ background: btn.color }}>
                    {btn.label.slice(0, 1) || '•'}
                  </span>
                )}
                <span className="deck-cell-label">{btn.label}</span>
              </>
            ) : (
              props.editing && <span className="deck-cell-plus">+</span>
            )}
          </div>
        )
      })}
    </div>
  )
}
