import { useEffect, useState } from 'react'
import type { AppConfig, CloseZoneStyle, DeckPage, GridStyle } from '@shared/types'
import { CLOSE_ZONE_LIMITS, DEFAULT_CLOSE_ZONE, DEFAULT_GRID_STYLE, GRID_STYLE_LIMITS } from '@shared/constants'

interface Props {
  config: AppConfig
  page: DeckPage
  onClose: () => void
  onSave: (patch: Partial<AppConfig>) => void
}

const CODE_TO_ACCEL: Record<string, string> = {
  Enter: 'Return',
  Escape: 'Escape',
  Tab: 'Tab',
  Space: 'Space',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  CapsLock: 'Capslock',
  PrintScreen: 'PrintScreen',
  Insert: 'Insert',
  Backquote: '`',
  Minus: '-',
  Equal: '='
}

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight'
])

function codeToAccel(code: string): string | null {
  if (code in CODE_TO_ACCEL) return CODE_TO_ACCEL[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  return null
}

function clamp(v: number, key: keyof typeof GRID_STYLE_LIMITS): number {
  const { min, max } = GRID_STYLE_LIMITS[key]
  return Math.min(max, Math.max(min, Math.round(v)))
}

function clampZone(v: number, key: keyof typeof CLOSE_ZONE_LIMITS): number {
  const { min, max } = CLOSE_ZONE_LIMITS[key]
  return Math.min(max, Math.max(min, v))
}

export default function SettingsModal(props: Props): React.JSX.Element {
  const [hotkey, setHotkey] = useState(props.config.hotkey)
  const [autoLaunch, setAutoLaunch] = useState(props.config.autoLaunch)
  const [showPageDots, setShowPageDots] = useState(props.config.showPageDots)
  const [pinned, setPinned] = useState(props.config.pinned)
  const [showPinButton, setShowPinButton] = useState(props.config.showPinButton)
  const [gridStyle, setGridStyle] = useState<GridStyle>(props.config.gridStyle)
  const [closeZone, setCloseZone] = useState<CloseZoneStyle>(props.config.closeZone)

  // Live-preview: pop the real overlay window (same rendering, same window) next to the
  // editor and keep it in sync as these fields change, so there is no separate "fake"
  // preview that could ever look different from the real thing.
  useEffect(() => {
    window.deck.previewOverlay({ ...props.config, gridStyle, showPageDots, closeZone, pinned, showPinButton })
  }, [gridStyle, showPageDots, closeZone, pinned, showPinButton])

  useEffect(() => {
    return () => {
      window.deck.stopOverlayPreview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patchStyle = (patch: Partial<GridStyle>): void =>
    setGridStyle((s) => {
      const next = { ...s, ...patch }
      return {
        ...next,
        cellWidth: clamp(next.cellWidth, 'cellWidth'),
        cellHeight: clamp(next.cellHeight, 'cellHeight'),
        gap: clamp(next.gap, 'gap'),
        borderRadius: clamp(next.borderRadius, 'borderRadius'),
        borderWidth: clamp(next.borderWidth, 'borderWidth')
      }
    })

  const save = (): void => {
    props.onSave({ hotkey, autoLaunch, showPageDots, gridStyle, closeZone, pinned, showPinButton })
    window.deck.stopOverlayPreview()
    props.onClose()
  }

  const cancel = (): void => {
    // Put the overlay's live state back to what's actually saved, since we've been
    // pushing draft values into it while previewing.
    window.deck.previewOverlay(props.config)
    window.deck.stopOverlayPreview()
    props.onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <div className="modal modal--wide">
        <h2>설정</h2>

        <div className="field">
          <label>호출 단축키 (마우스 위치에 덱을 띄우는 키)</label>
          <input
            className="field-input"
            readOnly
            value={hotkey}
            placeholder="클릭하고 원하는 키 조합을 누르세요"
            onKeyDown={(e) => {
              e.preventDefault()
              if (MODIFIER_CODES.has(e.code)) return
              const parts: string[] = []
              if (e.ctrlKey) parts.push('Control')
              if (e.altKey) parts.push('Alt')
              if (e.shiftKey) parts.push('Shift')
              if (e.metaKey) parts.push('Super')
              const key = codeToAccel(e.code)
              if (key) parts.push(key)
              if (parts.length >= 2) setHotkey(parts.join('+'))
            }}
          />
          <p className="field-hint">최소 조합키(Ctrl/Alt/Shift/Win) 하나 + 일반 키 하나가 필요해요.</p>
        </div>

        <div className="field field--row">
          <label htmlFor="autolaunch">Windows 시작 시 자동 실행</label>
          <input
            id="autolaunch"
            type="checkbox"
            checked={autoLaunch}
            onChange={(e) => setAutoLaunch(e.target.checked)}
          />
        </div>

        <div className="field field--row">
          <label htmlFor="showdots">페이지 수 표시 (오버레이 하단 점)</label>
          <input
            id="showdots"
            type="checkbox"
            checked={showPageDots}
            onChange={(e) => setShowPageDots(e.target.checked)}
          />
        </div>

        <div className="field field--row">
          <label htmlFor="pinned">상시 고정 모드 (버튼을 눌러도 안 닫히고, 화면에 계속 떠있어요)</label>
          <input
            id="pinned"
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
          />
        </div>

        <div className="field field--row">
          <label htmlFor="pinbutton">오버레이에 고정 버튼 표시 (오른쪽 위 📌 — 눌러서 바로 고정 켜고 끄기)</label>
          <input
            id="pinbutton"
            type="checkbox"
            checked={showPinButton}
            onChange={(e) => setShowPinButton(e.target.checked)}
          />
        </div>

        <div className="field">
          <label>덱 버튼 모양</label>
          <p className="field-hint">
            에디터 창 옆에 실제 오버레이 창이 떠서 지금 이 값 그대로 보여줘요 — 별도의 미리보기가
            아니라 진짜예요.
          </p>
          <div className="grid-style-fields">
            <label className="grid-style-field">
              <span>폭 (px)</span>
              <input
                className="field-input field-input--small"
                type="number"
                min={GRID_STYLE_LIMITS.cellWidth.min}
                max={GRID_STYLE_LIMITS.cellWidth.max}
                value={gridStyle.cellWidth}
                onChange={(e) => patchStyle({ cellWidth: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="grid-style-field">
              <span>높이 (px)</span>
              <input
                className="field-input field-input--small"
                type="number"
                min={GRID_STYLE_LIMITS.cellHeight.min}
                max={GRID_STYLE_LIMITS.cellHeight.max}
                value={gridStyle.cellHeight}
                onChange={(e) => patchStyle({ cellHeight: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="grid-style-field">
              <span>버튼 간격 (px)</span>
              <input
                className="field-input field-input--small"
                type="number"
                min={0}
                max={GRID_STYLE_LIMITS.gap.max}
                value={gridStyle.gap}
                onChange={(e) => patchStyle({ gap: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="grid-style-field">
              <span>모서리 둥글기 (px)</span>
              <input
                className="field-input field-input--small"
                type="number"
                min={0}
                max={GRID_STYLE_LIMITS.borderRadius.max}
                value={gridStyle.borderRadius}
                onChange={(e) => patchStyle({ borderRadius: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="grid-style-field">
              <span>테두리 두께 (px)</span>
              <input
                className="field-input field-input--small"
                type="number"
                min={0}
                max={GRID_STYLE_LIMITS.borderWidth.max}
                value={gridStyle.borderWidth}
                onChange={(e) => patchStyle({ borderWidth: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="grid-style-field">
              <span>테두리 색</span>
              <input
                type="color"
                className="color-input"
                value={gridStyle.borderColor}
                onChange={(e) => setGridStyle((s) => ({ ...s, borderColor: e.target.value }))}
              />
            </label>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setGridStyle({ ...DEFAULT_GRID_STYLE })}
          >
            기본값으로 초기화
          </button>
        </div>

        <div className="field" style={pinned ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
          <label>바깥 클릭 대신 — 마우스가 벗어나면 자동으로 닫히는 범위</label>
          <p className="field-hint">
            {pinned
              ? '상시 고정 모드에서는 자동으로 닫히지 않아서 이 설정이 적용되지 않아요.'
              : '오버레이 밖으로 마우스가 나가면 자동으로 닫혀요. 이 범위 안에서는 계속 열려있어요. 지금 옆에 뜬 실제 미리보기에서 범위가 그대로 보여요.'}
          </p>
          <div className="grid-style-fields">
            <label className="grid-style-field">
              <span>범위 크기 (px)</span>
              <input
                className="field-input field-input--small"
                type="number"
                min={CLOSE_ZONE_LIMITS.margin.min}
                max={CLOSE_ZONE_LIMITS.margin.max}
                value={closeZone.margin}
                onChange={(e) =>
                  setCloseZone((z) => ({ ...z, margin: clampZone(Number(e.target.value) || 0, 'margin') }))
                }
              />
            </label>
            <label className="grid-style-field">
              <span>투명도 (%)</span>
              <input
                className="field-input field-input--small"
                type="number"
                min={0}
                max={100}
                value={Math.round(closeZone.opacity * 100)}
                onChange={(e) =>
                  setCloseZone((z) => ({
                    ...z,
                    opacity: clampZone((Number(e.target.value) || 0) / 100, 'opacity')
                  }))
                }
              />
            </label>
          </div>
          <div className="icon-mode-toggle">
            <button
              type="button"
              className={`icon-mode-option ${closeZone.visual === 'fill' ? 'is-active' : ''}`}
              onClick={() => setCloseZone((z) => ({ ...z, visual: 'fill' }))}
            >
              면으로 표시
            </button>
            <button
              type="button"
              className={`icon-mode-option ${closeZone.visual === 'line' ? 'is-active' : ''}`}
              onClick={() => setCloseZone((z) => ({ ...z, visual: 'line' }))}
            >
              선으로 표시
            </button>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setCloseZone({ ...DEFAULT_CLOSE_ZONE })}
          >
            기본값으로 초기화
          </button>
        </div>

        <div className="modal-actions">
          <div className="modal-actions-spacer" />
          <button type="button" className="btn-secondary" onClick={cancel}>
            취소
          </button>
          <button type="button" className="btn-primary" onClick={save}>
            저장
          </button>
        </div>
      </div>
    </div>
  )
}
