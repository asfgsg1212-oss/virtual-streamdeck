import { useEffect, useState, useCallback, useMemo } from 'react'
import type { AppConfig, DeckButton, DeckPage, GridContents, Profile } from '@shared/types'
import { DEFAULT_COLS, DEFAULT_ROWS } from '@shared/constants'
import { resolveGrid } from '@shared/selectors'
import Sidebar from './components/Sidebar'
import DeckGrid from './components/DeckGrid'
import ButtonModal from './components/ButtonModal'
import SettingsModal from './components/SettingsModal'

function newPage(name: string, cols: number, rows: number): DeckPage {
  return { id: crypto.randomUUID(), name, cols, rows, buttons: new Array(cols * rows).fill(null) }
}

/** "페이지 N" for the lowest N not already used by an existing page, so deleting/renaming pages
 *  doesn't push later names ever upward. */
function nextPageName(existing: DeckPage[]): string {
  const used = new Set(existing.map((p) => p.name))
  let n = 1
  while (used.has(`페이지 ${n}`)) n++
  return `페이지 ${n}`
}

function newProfile(name: string, cols: number, rows: number): Profile {
  const page = newPage('페이지 1', cols, rows)
  return { id: crypto.randomUUID(), name, pages: [page], activePageId: page.id }
}

/** Replaces the grid at `path` (a chain of folder-button ids) below `root` with `updater`'s result. */
function applyAtPath<T extends GridContents>(
  root: T,
  path: string[],
  updater: (g: GridContents) => GridContents
): T {
  if (path.length === 0) return { ...root, ...updater(root) }
  const [head, ...rest] = path
  return {
    ...root,
    buttons: root.buttons.map((b) => {
      if (b?.id !== head || b.action?.type !== 'folder' || !b.action.folder) return b
      return { ...b, action: { ...b.action, folder: applyAtPath(b.action.folder, rest, updater) } }
    })
  }
}

export default function App(): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [selectedPageId, setSelectedPageId] = useState<string>('')
  const [folderPath, setFolderPath] = useState<string[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hotkeyError, setHotkeyError] = useState(false)

  useEffect(() => {
    window.deck.getConfig().then((cfg) => {
      setConfig(cfg)
      setSelectedProfileId(cfg.activeProfileId)
      const profile = cfg.profiles.find((p) => p.id === cfg.activeProfileId)
      setSelectedPageId(profile?.activePageId ?? profile?.pages[0]?.id ?? '')
    })
  }, [])

  const commit = useCallback((next: AppConfig) => {
    setConfig(next)
    window.deck.saveConfig(next).then((res) => setHotkeyError(res.hotkeyError))
  }, [])

  const profile = useMemo(
    () => config?.profiles.find((p) => p.id === selectedProfileId) ?? null,
    [config, selectedProfileId]
  )
  const page = useMemo(
    () => profile?.pages.find((p) => p.id === selectedPageId) ?? null,
    [profile, selectedPageId]
  )
  const grid = useMemo(() => (page ? resolveGrid(page, folderPath) : null), [page, folderPath])
  const breadcrumb = useMemo(() => {
    if (!page) return []
    const labels: string[] = []
    let current: GridContents = page
    for (const id of folderPath) {
      const btn = current.buttons.find((b) => b?.id === id)
      if (!btn) break
      labels.push(btn.label)
      if (btn.action?.type === 'folder' && btn.action.folder) current = btn.action.folder
      else break
    }
    return labels
  }, [page, folderPath])

  if (!config || !profile || !page || !grid) {
    return (
      <div className="app-loading">
        <span>불러오는 중…</span>
      </div>
    )
  }

  const selectProfile = (id: string): void => {
    setSelectedProfileId(id)
    setFolderPath([])
    const p = config.profiles.find((pr) => pr.id === id)
    setSelectedPageId(p?.activePageId ?? p?.pages[0]?.id ?? '')
    commit({ ...config, activeProfileId: id })
  }

  const selectPage = (id: string): void => {
    setSelectedPageId(id)
    setFolderPath([])
    commit({
      ...config,
      profiles: config.profiles.map((p) => (p.id === profile.id ? { ...p, activePageId: id } : p))
    })
  }

  const addProfile = (): void => {
    const p = newProfile(`프로필 ${config.profiles.length + 1}`, DEFAULT_COLS, DEFAULT_ROWS)
    setSelectedProfileId(p.id)
    setSelectedPageId(p.pages[0].id)
    setFolderPath([])
    commit({ ...config, profiles: [...config.profiles, p], activeProfileId: p.id })
  }

  const renameProfile = (id: string, name: string): void => {
    commit({
      ...config,
      profiles: config.profiles.map((p) => (p.id === id ? { ...p, name } : p))
    })
  }

  const deleteProfile = (id: string): void => {
    if (config.profiles.length <= 1) return
    const remaining = config.profiles.filter((p) => p.id !== id)
    const nextActive = id === config.activeProfileId ? remaining[0].id : config.activeProfileId
    if (id === selectedProfileId) {
      setSelectedProfileId(remaining[0].id)
      setSelectedPageId(remaining[0].pages[0].id)
      setFolderPath([])
    }
    commit({ ...config, profiles: remaining, activeProfileId: nextActive })
  }

  const addPage = (): void => {
    const p = newPage(nextPageName(profile.pages), page.cols, page.rows)
    setSelectedPageId(p.id)
    setFolderPath([])
    commit({
      ...config,
      profiles: config.profiles.map((pr) =>
        pr.id === profile.id ? { ...pr, pages: [...pr.pages, p], activePageId: p.id } : pr
      )
    })
  }

  const renamePage = (id: string, name: string): void => {
    commit({
      ...config,
      profiles: config.profiles.map((pr) =>
        pr.id === profile.id
          ? { ...pr, pages: pr.pages.map((pg) => (pg.id === id ? { ...pg, name } : pg)) }
          : pr
      )
    })
  }

  const deletePage = (id: string): void => {
    if (profile.pages.length <= 1) return
    const remaining = profile.pages.filter((pg) => pg.id !== id)
    if (id === selectedPageId) {
      setSelectedPageId(remaining[0].id)
      setFolderPath([])
    }
    commit({
      ...config,
      profiles: config.profiles.map((pr) =>
        pr.id === profile.id ? { ...pr, pages: remaining, activePageId: remaining[0].id } : pr
      )
    })
  }

  /** Applies `updater` to whichever grid is currently open: the page itself, or the folder drilled into. */
  const updateGrid = (updater: (g: GridContents) => GridContents): void => {
    const updatedPage = applyAtPath(page, folderPath, updater)
    commit({
      ...config,
      profiles: config.profiles.map((pr) =>
        pr.id === profile.id
          ? { ...pr, pages: pr.pages.map((pg) => (pg.id === page.id ? updatedPage : pg)) }
          : pr
      )
    })
  }

  const saveButton = (index: number, btn: DeckButton | null): void => {
    updateGrid((g) => {
      const buttons = [...g.buttons]
      buttons[index] = btn
      return { ...g, buttons }
    })
  }

  const swapButtons = (a: number, b: number): void => {
    updateGrid((g) => {
      const buttons = [...g.buttons]
      ;[buttons[a], buttons[b]] = [buttons[b], buttons[a]]
      return { ...g, buttons }
    })
  }

  const resizeGrid = (cols: number, rows: number): void => {
    updateGrid((g) => {
      const size = cols * rows
      const buttons = g.buttons.slice(0, size)
      while (buttons.length < size) buttons.push(null)
      return { ...g, cols, rows, buttons }
    })
  }

  const saveSettings = (patch: Partial<AppConfig>): void => {
    commit({ ...config, ...patch })
  }

  const enterFolder = (buttonId: string): void => setFolderPath((p) => [...p, buttonId])
  const goBack = (): void => setFolderPath((p) => p.slice(0, -1))

  const otherPages = profile.pages.filter((p) => p.id !== page.id)

  return (
    <div className="app-shell">
      <Sidebar
        profiles={config.profiles}
        selectedProfileId={profile.id}
        onSelectProfile={selectProfile}
        onAddProfile={addProfile}
        onRenameProfile={renameProfile}
        onDeleteProfile={deleteProfile}
        pages={profile.pages}
        selectedPageId={page.id}
        onSelectPage={selectPage}
        onAddPage={addPage}
        onRenamePage={renamePage}
        onDeletePage={deletePage}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <main className="app-main">
        <header className="app-header">
          <h1>{profile.name}</h1>
          <span className="app-header-sub">
            {page.name}
            {breadcrumb.map((label, i) => (
              <span key={i}> / {label}</span>
            ))}
          </span>
          {folderPath.length > 0 && (
            <button type="button" className="btn-secondary" onClick={goBack}>
              ← 뒤로
            </button>
          )}
          <span className="page-size">
            <input
              className="field-input field-input--small"
              type="number"
              min={1}
              max={6}
              value={grid.cols}
              onChange={(e) => resizeGrid(Math.min(6, Math.max(1, Number(e.target.value) || 1)), grid.rows)}
            />
            ×
            <input
              className="field-input field-input--small"
              type="number"
              min={1}
              max={5}
              value={grid.rows}
              onChange={(e) => resizeGrid(grid.cols, Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
            />
          </span>
        </header>
        {hotkeyError && (
          <div className="app-banner app-banner--error">
            호출 단축키를 등록하지 못했습니다. 다른 프로그램이 이미 사용 중일 수 있어요. 설정에서
            바꿔보세요.
          </div>
        )}
        <DeckGrid
          cols={grid.cols}
          rows={grid.rows}
          buttons={grid.buttons}
          onCellClick={(i) => setEditingIndex(i)}
          onSwap={swapButtons}
        />
      </main>

      {editingIndex !== null && (
        <ButtonModal
          button={grid.buttons[editingIndex]}
          otherPages={otherPages}
          onClose={() => setEditingIndex(null)}
          onSave={(btn) => {
            saveButton(editingIndex, btn)
            setEditingIndex(null)
          }}
          onDelete={() => {
            saveButton(editingIndex, null)
            setEditingIndex(null)
          }}
          onEnterFolder={(buttonId) => {
            setEditingIndex(null)
            enterFolder(buttonId)
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          config={config}
          page={page}
          onClose={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      )}
    </div>
  )
}
