import { useEffect, useState, useCallback } from 'react'
import type { AppConfig, DeckButton, GridContents, Profile } from '@shared/types'
import { PAGE_DOTS_HEIGHT } from '@shared/constants'
import { findActive, resolveGrid } from '@shared/selectors'
import GridCells from '@renderer/shared/GridCells'

export default function App(): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [pageId, setPageId] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState<string[]>([])
  const [isPreview, setIsPreview] = useState(false)

  useEffect(() => {
    window.deck.getConfig().then((cfg) => {
      setConfig(cfg)
      const active = findActive(cfg)
      setPageId(active?.page.id ?? null)
    })

    const offConfig = window.deck.onConfigUpdated((cfg) => {
      setConfig(cfg)
      setPageId((prev) => {
        const profile = cfg.profiles.find((p) => p.id === cfg.activeProfileId)
        if (profile && prev && profile.pages.some((pg) => pg.id === prev)) return prev
        return findActive(cfg)?.page.id ?? null
      })
    })
    const offPreview = window.deck.onPreviewMode(setIsPreview)

    return () => {
      offConfig()
      offPreview()
    }
  }, [])

  const close = useCallback(() => {
    window.deck.hideOverlay()
  }, [])

  const goToPage = useCallback((id: string, profile: Profile) => {
    setPageId(id)
    setFolderPath([])
    const target = profile.pages.find((p) => p.id === id)
    if (target) window.deck.resizeOverlayForPage(target.cols, target.rows)
  }, [])

  const enterFolder = useCallback(
    (buttonId: string, root: GridContents) => {
      const next = [...folderPath, buttonId]
      const resolved = resolveGrid(root, next)
      setFolderPath(next)
      window.deck.resizeOverlayForPage(resolved.cols, resolved.rows)
    },
    [folderPath]
  )

  const goBack = useCallback(
    (root: GridContents) => {
      const next = folderPath.slice(0, -1)
      const resolved = resolveGrid(root, next)
      setFolderPath(next)
      window.deck.resizeOverlayForPage(resolved.cols, resolved.rows)
    },
    [folderPath]
  )

  const runButton = useCallback(
    (btn: DeckButton, profile: Profile, root: GridContents) => {
      // Just a picture of what pressing this would do — don't actually launch/type/switch.
      if (isPreview) return
      if (!btn.action) return
      if (btn.action.type === 'folder') {
        enterFolder(btn.id, root)
        return
      }
      if (btn.action.type === 'switchPage') {
        const target = btn.action.value
        if (target === 'next' || target === 'prev') {
          const ids = profile.pages.map((p) => p.id)
          const idx = ids.indexOf(pageId ?? '')
          const delta = target === 'next' ? 1 : -1
          const nextIdx = (idx + delta + ids.length) % ids.length
          goToPage(ids[nextIdx], profile)
        } else {
          goToPage(target, profile)
        }
        return
      }
      // Hide first and wait for it to land, so focus returns to the target app
      // before main sends the actual key/mouse input.
      window.deck.hideOverlay().then(() => window.deck.executeAction(btn.action!))
    },
    [isPreview, pageId, goToPage, enterFolder]
  )

  if (!config) return <div className="overlay-shell" />

  const active = findActive(config)
  if (!active) return <div className="overlay-shell" />
  const page = active.profile.pages.find((p) => p.id === pageId) ?? active.page
  const grid = resolveGrid(page, folderPath)
  const style = config.gridStyle
  const inFolder = folderPath.length > 0
  const zone = config.closeZone

  return (
    <div
      className="overlay-shell"
      onMouseLeave={isPreview ? undefined : close}
      style={
        {
          '--zone-margin': `${zone.margin}px`,
          '--zone-opacity': zone.opacity
        } as React.CSSProperties
      }
    >
      <div className={`overlay-zone overlay-zone--${zone.visual}`} />
      <div className="overlay-content">
        <div className="overlay-root">
          <GridCells
            cols={grid.cols}
            rows={grid.rows}
            style={style}
            buttons={grid.buttons}
            bottomReserved={config.showPageDots ? PAGE_DOTS_HEIGHT : 0}
            onCellClick={(_i, btn) => btn && runButton(btn, active.profile, page)}
          />
          {config.showPageDots && active.profile.pages.length > 1 && (
            <div className="overlay-footer">
              <div className="overlay-dots">
                {active.profile.pages.map((p) => (
                  <span key={p.id} className={`overlay-dot ${p.id === page.id ? 'is-active' : ''}`} />
                ))}
              </div>
            </div>
          )}
          {inFolder && (
            <button className="overlay-back" onClick={() => goBack(page)} title="뒤로">
              ←
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
