export type ActionType =
  | 'hotkey'
  | 'text'
  | 'launch'
  | 'url'
  | 'media'
  | 'mouseClick'
  | 'macro'
  | 'switchPage'
  | 'folder'

export type MediaKey = 'mute' | 'volumeUp' | 'volumeDown' | 'playPause' | 'nextTrack' | 'prevTrack'

export interface MacroStep {
  type: Exclude<ActionType, 'macro' | 'switchPage' | 'folder'> | 'wait'
  value: string
}

export interface ButtonAction {
  type: ActionType
  value: string
  steps?: MacroStep[]
  /** Only for type 'folder': a nested grid of buttons, reachable by clicking this button. */
  folder?: GridContents
  /** Only for type 'launch': multiple programs that all open together when pressed. */
  paths?: string[]
  /** Only for type 'hotkey' or 'url': multiple combos/addresses that all fire when pressed. */
  values?: string[]
}

export type IconMode = 'iconLabel' | 'fill'

export interface DeckButton {
  id: string
  label: string
  icon?: string
  color?: string
  iconMode?: IconMode
  action?: ButtonAction
}

/** A grid of buttons: what a DeckPage is, and also what a 'folder' button opens into. */
export interface GridContents {
  cols: number
  rows: number
  buttons: (DeckButton | null)[]
}

export interface DeckPage extends GridContents {
  id: string
  name: string
}

export interface Profile {
  id: string
  name: string
  pages: DeckPage[]
  activePageId: string
}

export interface GridStyle {
  cellWidth: number
  cellHeight: number
  gap: number
  borderRadius: number
  borderWidth: number
  borderColor: string
}

/** The hover buffer around the overlay: move the mouse out past it and the deck auto-closes. */
export interface CloseZoneStyle {
  margin: number
  visual: 'line' | 'fill'
  opacity: number
}

export interface AppConfig {
  profiles: Profile[]
  activeProfileId: string
  hotkey: string
  autoLaunch: boolean
  gridStyle: GridStyle
  showPageDots: boolean
  closeZone: CloseZoneStyle
}

export interface RunningApp {
  name: string
  title: string
  path: string
  icon: string | null
}
