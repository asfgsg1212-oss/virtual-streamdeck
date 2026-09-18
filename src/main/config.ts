import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { AppConfig, DeckPage, Profile } from '../shared/types'
import {
  DEFAULT_CLOSE_ZONE,
  DEFAULT_COLS,
  DEFAULT_GRID_STYLE,
  DEFAULT_HOTKEY,
  DEFAULT_ROWS
} from '../shared/constants'

function emptyPage(name: string, cols: number, rows: number): DeckPage {
  return { id: randomUUID(), name, cols, rows, buttons: new Array(cols * rows).fill(null) }
}

function defaultConfig(): AppConfig {
  const page = emptyPage('페이지 1', DEFAULT_COLS, DEFAULT_ROWS)
  const profile: Profile = {
    id: randomUUID(),
    name: '기본 프로필',
    pages: [page],
    activePageId: page.id
  }
  return {
    profiles: [profile],
    activeProfileId: profile.id,
    hotkey: DEFAULT_HOTKEY,
    autoLaunch: false,
    gridStyle: { ...DEFAULT_GRID_STYLE },
    showPageDots: true,
    closeZone: { ...DEFAULT_CLOSE_ZONE },
    pinned: false
  }
}

/** Fills in gridStyle and per-page cols/rows for config.json files written before either existed. */
function migrate(parsed: Record<string, unknown>): AppConfig {
  const legacyCols = (parsed.gridCols as number) || DEFAULT_COLS
  const legacyRows = (parsed.gridRows as number) || DEFAULT_ROWS
  const rawProfiles = Array.isArray(parsed.profiles) ? parsed.profiles : []

  const profiles: Profile[] = rawProfiles.map((pr: Profile) => ({
    ...pr,
    pages: (pr.pages ?? []).map((pg: DeckPage) => {
      const cols = pg.cols || legacyCols
      const rows = pg.rows || legacyRows
      const size = cols * rows
      const buttons = (pg.buttons ?? []).slice(0, size)
      while (buttons.length < size) buttons.push(null)
      return { ...pg, cols, rows, buttons }
    })
  }))

  return {
    ...defaultConfig(),
    ...parsed,
    profiles: profiles.length ? profiles : defaultConfig().profiles,
    gridStyle: { ...DEFAULT_GRID_STYLE, ...(parsed.gridStyle as object) }
  } as AppConfig
}

const configPath = (): string => join(app.getPath('userData'), 'config.json')

export function loadConfig(): AppConfig {
  const path = configPath()
  if (!existsSync(path)) {
    const config = defaultConfig()
    saveConfig(config)
    return config
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    return migrate(JSON.parse(raw))
  } catch {
    return defaultConfig()
  }
}

export function saveConfig(config: AppConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf-8')
}
