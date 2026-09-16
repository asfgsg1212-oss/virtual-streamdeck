import type { AppConfig, DeckPage, GridContents, Profile } from './types'

export function findActive(config: AppConfig): { profile: Profile; page: DeckPage } | null {
  const profile =
    config.profiles.find((p) => p.id === config.activeProfileId) ?? config.profiles[0]
  if (!profile) return null
  const page = profile.pages.find((p) => p.id === profile.activePageId) ?? profile.pages[0]
  if (!page) return null
  return { profile, page }
}

/** Walks a chain of folder-button ids down from a root grid (a page or another folder). */
export function resolveGrid(root: GridContents, path: string[]): GridContents {
  let current: GridContents = root
  for (const id of path) {
    const btn = current.buttons.find((b) => b?.id === id)
    if (btn?.action?.type === 'folder' && btn.action.folder) {
      current = btn.action.folder
    } else {
      break
    }
  }
  return current
}
