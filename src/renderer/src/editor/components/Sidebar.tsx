import { useState } from 'react'
import type { DeckPage, Profile } from '@shared/types'

interface Props {
  profiles: Profile[]
  selectedProfileId: string
  onSelectProfile: (id: string) => void
  onAddProfile: () => void
  onRenameProfile: (id: string, name: string) => void
  onDeleteProfile: (id: string) => void
  pages: DeckPage[]
  selectedPageId: string
  onSelectPage: (id: string) => void
  onAddPage: () => void
  onRenamePage: (id: string, name: string) => void
  onDeletePage: (id: string) => void
  onOpenSettings: () => void
}

function EditableRow(props: {
  active: boolean
  name: string
  onSelect: () => void
  onRename: (name: string) => void
  onDelete: () => void
  deletable: boolean
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.name)

  const commit = (): void => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== props.name) props.onRename(trimmed)
    else setDraft(props.name)
  }

  return (
    <div className={`list-row ${props.active ? 'is-active' : ''}`} onClick={props.onSelect}>
      {editing ? (
        <input
          autoFocus
          className="list-row-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(props.name)
              setEditing(false)
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="list-row-name"
          onDoubleClick={(e) => {
            e.stopPropagation()
            setEditing(true)
          }}
        >
          {props.name}
        </span>
      )}
      {props.deletable && (
        <button
          className="list-row-delete"
          title="삭제"
          onClick={(e) => {
            e.stopPropagation()
            props.onDelete()
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}

export default function Sidebar(props: Props): React.JSX.Element {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Virtual StreamDeck</div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          프로필
          <button className="sidebar-add" onClick={props.onAddProfile} title="프로필 추가">
            +
          </button>
        </div>
        <div className="list">
          {props.profiles.map((p) => (
            <EditableRow
              key={p.id}
              active={p.id === props.selectedProfileId}
              name={p.name}
              onSelect={() => props.onSelectProfile(p.id)}
              onRename={(name) => props.onRenameProfile(p.id, name)}
              onDelete={() => props.onDeleteProfile(p.id)}
              deletable={props.profiles.length > 1}
            />
          ))}
        </div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">
          페이지
          <button className="sidebar-add" onClick={props.onAddPage} title="페이지 추가">
            +
          </button>
        </div>
        <div className="list">
          {props.pages.map((p) => (
            <EditableRow
              key={p.id}
              active={p.id === props.selectedPageId}
              name={p.name}
              onSelect={() => props.onSelectPage(p.id)}
              onRename={(name) => props.onRenamePage(p.id, name)}
              onDelete={() => props.onDeletePage(p.id)}
              deletable={props.pages.length > 1}
            />
          ))}
        </div>
      </div>

      <button className="sidebar-settings" onClick={props.onOpenSettings}>
        ⚙ 설정
      </button>
    </aside>
  )
}
