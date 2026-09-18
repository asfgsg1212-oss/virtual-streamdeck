import { useEffect, useState } from 'react'
import type {
  ActionType,
  ButtonAction,
  DeckButton,
  DeckPage,
  GridContents,
  IconMode,
  MacroStep,
  RunningApp
} from '@shared/types'
import { DEFAULT_COLS, DEFAULT_ROWS } from '@shared/constants'
import { suggestIcon } from '@renderer/shared/iconSuggestions'

interface Props {
  button: DeckButton | null
  otherPages: DeckPage[]
  onClose: () => void
  onSave: (btn: DeckButton) => void
  onDelete: () => void
  onEnterFolder: (buttonId: string) => void
}

const ACTION_LABELS: Record<ActionType, string> = {
  hotkey: '단축키',
  text: '문자 입력',
  launch: '프로그램 실행',
  url: 'URL 열기',
  media: '미디어 키',
  mouseClick: '마우스 클릭',
  macro: '매크로 (여러 동작)',
  switchPage: '페이지 전환',
  folder: '폴더 (하위 버튼 묶음)'
}

function emptyFolder(): GridContents {
  return {
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    buttons: new Array(DEFAULT_COLS * DEFAULT_ROWS).fill(null)
  }
}

const MEDIA_OPTIONS: { value: string; label: string }[] = [
  { value: 'mute', label: '음소거' },
  { value: 'volumeUp', label: '볼륨 +' },
  { value: 'volumeDown', label: '볼륨 -' },
  { value: 'playPause', label: '재생/일시정지' },
  { value: 'nextTrack', label: '다음 곡' },
  { value: 'prevTrack', label: '이전 곡' }
]

const CODE_TOKEN: Record<string, string> = {
  Enter: 'enter',
  Escape: 'escape',
  Tab: 'tab',
  Space: 'space',
  Backspace: 'backspace',
  Delete: 'delete',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  CapsLock: 'capslock',
  PrintScreen: 'print',
  Insert: 'insert',
  Backquote: 'grave',
  Minus: 'minus',
  Equal: 'equal'
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

function codeToToken(code: string): string | null {
  if (code in CODE_TOKEN) return CODE_TOKEN[code]
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase()
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code.toLowerCase()
  return null
}

function HotkeyField(props: { value: string; onChange: (v: string) => void }): React.JSX.Element {
  const [recording, setRecording] = useState(false)
  return (
    <input
      className="field-input"
      readOnly
      value={props.value || ''}
      placeholder="클릭하고 원하는 키 조합을 누르세요"
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      style={recording ? { borderColor: '#818cf8' } : undefined}
      onKeyDown={(e) => {
        e.preventDefault()
        if (MODIFIER_CODES.has(e.code)) return
        const parts: string[] = []
        if (e.ctrlKey) parts.push('ctrl')
        if (e.altKey) parts.push('alt')
        if (e.shiftKey) parts.push('shift')
        if (e.metaKey) parts.push('win')
        const token = codeToToken(e.code)
        if (token) parts.push(token)
        if (parts.length) props.onChange(parts.join('+'))
      }}
    />
  )
}

function ProgramPickerPanel(props: {
  onPick: (path: string, icon: string | null) => void
}): React.JSX.Element {
  const [apps, setApps] = useState<RunningApp[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    window.deck.listRunningApps().then((list) => {
      if (!cancelled) {
        setApps(list)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const browse = async (): Promise<void> => {
    const result = await window.deck.pickFile()
    if (!result) return
    const icon = await window.deck.getFileIcon(result)
    props.onPick(result, icon)
  }

  return (
    <div className="program-picker">
      <button type="button" className="program-picker-browse" onClick={browse}>
        직접 찾아보기…
      </button>
      {loading && <p className="field-hint">불러오는 중…</p>}
      {apps && apps.length === 0 && !loading && (
        <p className="field-hint">창이 열려 있는 프로그램이 없어요.</p>
      )}
      {apps?.map((a) => (
        <button
          type="button"
          key={a.path}
          className="program-picker-item"
          onClick={() => props.onPick(a.path, a.icon)}
        >
          {a.icon ? (
            <img src={a.icon} alt="" />
          ) : (
            <span className="program-picker-fallback">{a.name.slice(0, 1)}</span>
          )}
          <span className="program-picker-name">{a.name}</span>
          <span className="program-picker-title">{a.title}</span>
        </button>
      ))}
    </div>
  )
}

function ProgramPicker(props: {
  value: string
  onChange: (v: string) => void
  onIconHint?: (icon: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="field-col">
      <div className="field-row">
        <input
          className="field-input"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder="C:\path\to\app.exe"
        />
        <button type="button" className="btn-secondary" onClick={() => setOpen((o) => !o)}>
          프로그램 선택하기
        </button>
      </div>
      {open && (
        <ProgramPickerPanel
          onPick={(p, icon) => {
            props.onChange(p)
            if (icon) props.onIconHint?.(icon)
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function LaunchList(props: {
  paths: string[]
  onChange: (paths: string[]) => void
  onIconHint?: (icon: string) => void
}): React.JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false)

  const updateAt = (i: number, v: string): void =>
    props.onChange(props.paths.map((p, idx) => (idx === i ? v : p)))
  const removeAt = (i: number): void => props.onChange(props.paths.filter((_, idx) => idx !== i))

  return (
    <div className="field-col">
      {props.paths.map((p, i) => (
        <div className="field-row" key={i}>
          <input
            className="field-input"
            value={p}
            onChange={(e) => updateAt(i, e.target.value)}
            placeholder="C:\path\to\app.exe"
          />
          <button type="button" className="list-row-delete" onClick={() => removeAt(i)}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={() => setPickerOpen((o) => !o)}>
        + 프로그램 추가
      </button>
      {pickerOpen && (
        <ProgramPickerPanel
          onPick={(p, icon) => {
            props.onChange([...props.paths, p])
            if (icon) props.onIconHint?.(icon)
            setPickerOpen(false)
          }}
        />
      )}
    </div>
  )
}

/** Repeatable list of same-type values (hotkey combos / URLs) that all fire in order when pressed. */
function ValueList(props: {
  type: 'hotkey' | 'url'
  values: string[]
  onChange: (values: string[]) => void
}): React.JSX.Element {
  const updateAt = (i: number, v: string): void =>
    props.onChange(props.values.map((val, idx) => (idx === i ? v : val)))
  const removeAt = (i: number): void => props.onChange(props.values.filter((_, idx) => idx !== i))
  const add = (): void => props.onChange([...props.values, ''])

  return (
    <div className="field-col">
      {props.values.map((v, i) => (
        <div className="field-row" key={i}>
          <div className="macro-step-value">
            <ValueField type={props.type} value={v} onChange={(nv) => updateAt(i, nv)} otherPages={[]} />
          </div>
          {props.values.length > 1 && (
            <button type="button" className="list-row-delete" onClick={() => removeAt(i)}>
              ×
            </button>
          )}
        </div>
      ))}
      <button type="button" className="btn-secondary" onClick={add}>
        + 추가
      </button>
    </div>
  )
}

/** Optional target for a 'media' action: leave blank for the global media key, or pick a specific
 *  app so this button only affects that app's playback/volume instead of whatever's active. */
function MediaTargetField(props: { value: string; onChange: (v: string) => void }): React.JSX.Element {
  const [apps, setApps] = useState<string[] | null>(null)

  useEffect(() => {
    window.deck.listAudioApps().then(setApps)
  }, [])

  return (
    <div className="field-col">
      <select
        className="field-input"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">전체 (기본 — 빠름)</option>
        {apps?.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <p className="field-hint">
        특정 프로그램을 고르면 그 프로그램의 소리/재생만 조절해요 (전체보다 조금 느려요). 목록에
        없으면 그 프로그램이 소리를 내고 있을 때 이 창을 다시 열어보세요.
      </p>
    </div>
  )
}

function ValueField(props: {
  type: ActionType | 'wait'
  value: string
  onChange: (v: string) => void
  otherPages: DeckPage[]
}): React.JSX.Element {
  switch (props.type) {
    case 'hotkey':
      return <HotkeyField value={props.value} onChange={props.onChange} />
    case 'text':
      return (
        <textarea
          className="field-input"
          rows={3}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder="입력할 문자열"
        />
      )
    case 'launch':
      return <ProgramPicker value={props.value} onChange={props.onChange} />
    case 'url':
      return (
        <input
          className="field-input"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder="https://example.com"
        />
      )
    case 'media':
      return (
        <select
          className="field-input"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        >
          {MEDIA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )
    case 'mouseClick':
      return (
        <select
          className="field-input"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        >
          <option value="left">왼쪽 클릭</option>
          <option value="right">오른쪽 클릭</option>
          <option value="double">더블 클릭</option>
        </select>
      )
    case 'switchPage':
      return (
        <select
          className="field-input"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        >
          <option value="next">다음 페이지</option>
          <option value="prev">이전 페이지</option>
          {props.otherPages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )
    case 'wait':
      return (
        <input
          className="field-input"
          type="number"
          min={0}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder="지연 시간(ms)"
        />
      )
    default:
      return <></>
  }
}

const STEP_TYPES: (ActionType | 'wait')[] = [
  'hotkey',
  'text',
  'launch',
  'url',
  'media',
  'mouseClick',
  'wait'
]

export default function ButtonModal(props: Props): React.JSX.Element {
  const existing = props.button
  const [label, setLabel] = useState(existing?.label ?? '')
  const [icon, setIcon] = useState<string | undefined>(existing?.icon)
  const [iconMode, setIconMode] = useState<IconMode>(existing?.iconMode ?? 'iconLabel')
  const [color, setColor] = useState<string>(existing?.color ?? '#6366f1')
  const [actionType, setActionType] = useState<ActionType>(existing?.action?.type ?? 'hotkey')
  const [actionValue, setActionValue] = useState<string>(
    existing?.action?.type !== 'macro' ? (existing?.action?.value ?? '') : ''
  )
  const [steps, setSteps] = useState<MacroStep[]>(existing?.action?.steps ?? [])
  const [launchPaths, setLaunchPaths] = useState<string[]>(() => {
    const a = existing?.action
    if (a?.type !== 'launch') return []
    if (a.paths?.length) return a.paths
    return a.value ? [a.value] : []
  })
  const [hotkeyValues, setHotkeyValues] = useState<string[]>(() => {
    const a = existing?.action
    if (a?.type !== 'hotkey') return ['']
    if (a.values?.length) return a.values
    return [a.value ?? '']
  })
  const [urlValues, setUrlValues] = useState<string[]>(() => {
    const a = existing?.action
    if (a?.type !== 'url') return ['']
    if (a.values?.length) return a.values
    return [a.value ?? '']
  })
  const [mediaTargetApp, setMediaTargetApp] = useState<string>(
    existing?.action?.type === 'media' ? (existing.action.targetApp ?? '') : ''
  )

  const pickImage = async (): Promise<void> => {
    const result = await window.deck.pickImage()
    if (result) setIcon(result)
  }

  const suggestedIcon = suggestIcon(label)

  const buildButton = (): DeckButton => {
    const trimmedLabel = label.trim() || '버튼'
    let action: ButtonAction | undefined
    if (actionType === 'macro') {
      action = { type: 'macro', value: '', steps }
    } else if (actionType === 'folder') {
      action = { type: 'folder', value: '', folder: existing?.action?.folder ?? emptyFolder() }
    } else if (actionType === 'launch') {
      const paths = launchPaths.map((p) => p.trim()).filter(Boolean)
      action = { type: 'launch', value: paths[0] ?? '', paths }
    } else if (actionType === 'hotkey') {
      const values = hotkeyValues.map((v) => v.trim()).filter(Boolean)
      action = { type: 'hotkey', value: values[0] ?? '', values }
    } else if (actionType === 'url') {
      const values = urlValues.map((v) => v.trim()).filter(Boolean)
      action = { type: 'url', value: values[0] ?? '', values }
    } else if (actionType === 'media') {
      action = { type: 'media', value: actionValue, targetApp: mediaTargetApp || undefined }
    } else {
      action = { type: actionType, value: actionValue }
    }
    return {
      id: existing?.id ?? crypto.randomUUID(),
      label: trimmedLabel,
      icon,
      color,
      iconMode,
      action
    }
  }

  const save = (): void => {
    props.onSave(buildButton())
  }

  const openFolder = (): void => {
    const btn = buildButton()
    props.onSave(btn)
    props.onEnterFolder(btn.id)
  }

  const addStep = (): void => {
    setSteps([...steps, { type: 'hotkey', value: '' }])
  }
  const updateStep = (i: number, patch: Partial<MacroStep>): void => {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
  }
  const removeStep = (i: number): void => {
    setSteps(steps.filter((_, idx) => idx !== i))
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal">
        <h2>버튼 편집</h2>

        <div className="field">
          <label>라벨</label>
          <input
            className="field-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="버튼 이름"
          />
        </div>

        <div className="field">
          <label>아이콘</label>
          <div className="icon-row">
            <div className="icon-preview">
              {icon ? <img src={icon} alt="" /> : <span>{label.slice(0, 1) || '?'}</span>}
            </div>
            <button type="button" className="btn-secondary" onClick={pickImage}>
              이미지 선택
            </button>
            {icon && (
              <button type="button" className="btn-secondary" onClick={() => setIcon(undefined)}>
                제거
              </button>
            )}
            <input
              type="color"
              className="color-input"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              title="아이콘이 없을 때 배경색"
            />
          </div>
          {suggestedIcon && suggestedIcon !== icon && (
            <button
              type="button"
              className="icon-suggestion"
              onClick={() => setIcon(suggestedIcon)}
            >
              <img src={suggestedIcon} alt="" />
              라벨로 찾은 아이콘 적용하기
            </button>
          )}
          <div className="icon-mode-toggle">
            <button
              type="button"
              className={`icon-mode-option ${iconMode === 'iconLabel' ? 'is-active' : ''}`}
              onClick={() => setIconMode('iconLabel')}
            >
              소형 아이콘 + 라벨
            </button>
            <button
              type="button"
              className={`icon-mode-option ${iconMode === 'fill' ? 'is-active' : ''}`}
              onClick={() => setIconMode('fill')}
            >
              칸 꽉 채우기
            </button>
          </div>
        </div>

        <div className="field">
          <label>동작</label>
          <select
            className="field-input"
            value={actionType}
            onChange={(e) => setActionType(e.target.value as ActionType)}
          >
            {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => (
              <option key={t} value={t}>
                {ACTION_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        {actionType === 'folder' ? (
          <div className="field">
            <p className="field-hint">
              폴더 안에 버튼을 따로 채울 수 있는 하위 페이지가 생겨요. 오버레이에서 이 버튼을 누르면
              폴더로 들어가고, 뒤로가기로 다시 나올 수 있어요.
            </p>
            <button type="button" className="btn-secondary" onClick={openFolder}>
              폴더 열기
            </button>
          </div>
        ) : actionType === 'macro' ? (
          <div className="field">
            <label>단계</label>
            <div className="macro-steps">
              {steps.map((step, i) => (
                <div className="macro-step" key={i}>
                  <select
                    className="field-input macro-step-type"
                    value={step.type}
                    onChange={(e) => updateStep(i, { type: e.target.value as MacroStep['type'], value: '' })}
                  >
                    {STEP_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t === 'wait' ? '대기' : ACTION_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <div className="macro-step-value">
                    <ValueField
                      type={step.type}
                      value={step.value}
                      onChange={(v) => updateStep(i, { value: v })}
                      otherPages={props.otherPages}
                    />
                    {step.type === 'media' && (
                      <MediaTargetField
                        value={step.targetApp ?? ''}
                        onChange={(v) => updateStep(i, { targetApp: v || undefined })}
                      />
                    )}
                  </div>
                  <button type="button" className="list-row-delete" onClick={() => removeStep(i)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-secondary" onClick={addStep}>
              + 단계 추가
            </button>
          </div>
        ) : actionType === 'launch' ? (
          <div className="field">
            <label>실행할 프로그램 (한 번에 다 같이 켜져요)</label>
            <LaunchList
              paths={launchPaths}
              onChange={setLaunchPaths}
              onIconHint={(hint) => !icon && setIcon(hint)}
            />
          </div>
        ) : actionType === 'hotkey' ? (
          <div className="field">
            <label>단축키 (순서대로 다 눌려요)</label>
            <ValueList type="hotkey" values={hotkeyValues} onChange={setHotkeyValues} />
          </div>
        ) : actionType === 'url' ? (
          <div className="field">
            <label>열 주소 (한 번에 다 같이 열려요)</label>
            <ValueList type="url" values={urlValues} onChange={setUrlValues} />
          </div>
        ) : actionType === 'media' ? (
          <div className="field">
            <label>값</label>
            <ValueField type="media" value={actionValue} onChange={setActionValue} otherPages={[]} />
            <MediaTargetField value={mediaTargetApp} onChange={setMediaTargetApp} />
          </div>
        ) : (
          <div className="field">
            <label>값</label>
            <ValueField
              type={actionType}
              value={actionValue}
              onChange={setActionValue}
              otherPages={props.otherPages}
            />
          </div>
        )}

        <div className="modal-actions">
          {existing && (
            <button type="button" className="btn-danger" onClick={props.onDelete}>
              버튼 삭제
            </button>
          )}
          <div className="modal-actions-spacer" />
          <button type="button" className="btn-secondary" onClick={props.onClose}>
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
