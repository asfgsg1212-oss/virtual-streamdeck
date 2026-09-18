import { BrowserWindow, screen, shell, globalShortcut } from 'electron'
import { join } from 'path'
import { is } from './env'
import { overlaySize, DEFAULT_COLS, DEFAULT_ROWS } from '../shared/constants'
import { captureFocus } from './actions'
import { loadConfig } from './config'
import { findActive } from '../shared/selectors'
import type { AppConfig, CloseZoneStyle } from '../shared/types'

/** Pinned mode never auto-closes on mouse-out, so the hover margin has nothing to do — skip the
 *  extra window space it would otherwise reserve. */
function closeZoneFor(config: AppConfig): CloseZoneStyle {
  return config.pinned ? { ...config.closeZone, margin: 0 } : config.closeZone
}

/** Sends once the page has actually loaded, instead of dropping the message on the floor. */
function sendWhenReady(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  const run = (): void => win.webContents.send(channel, ...args)
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', run)
  else run()
}

let overlayWin: BrowserWindow | null = null
let editorWin: BrowserWindow | null = null

function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 400,
    height: 260,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    show: false,
    fullscreenable: false,
    // Never take OS keyboard focus (Windows WS_EX_NOACTIVATE): clicking a deck button still
    // works (mouse hit-testing isn't gated by activation), but the previously-focused app
    // (e.g. Notepad mid IME composition) never loses focus, so there's nothing to restore
    // before sending keystrokes/text.
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  win.on('closed', () => {
    overlayWin = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/overlay.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/overlay.html'))
  }
  return win
}

export function getOverlayWindow(): BrowserWindow {
  if (!overlayWin || overlayWin.isDestroyed()) {
    overlayWin = createOverlayWindow()
  }
  return overlayWin
}

export function getExistingOverlayWindow(): BrowserWindow | null {
  return overlayWin && !overlayWin.isDestroyed() ? overlayWin : null
}

function boundsAround(
  centerX: number,
  centerY: number,
  width: number,
  height: number
): { x: number; y: number; width: number; height: number } {
  const display = screen.getDisplayNearestPoint({ x: centerX, y: centerY })
  const area = display.workArea
  let x = Math.round(centerX - width / 2)
  let y = Math.round(centerY - height / 2)
  x = Math.max(area.x + 4, Math.min(x, area.x + area.width - width - 4))
  y = Math.max(area.y + 4, Math.min(y, area.y + area.height - height - 4))
  return { x, y, width, height }
}

export function toggleOverlay(): void {
  const win = getOverlayWindow()
  if (win.isVisible()) {
    hideOverlay()
    return
  }

  stopPreviewFollow()
  // In case this window was left in settings-preview mode (child of the editor, not
  // always-on-top) — the real hotkey popup always gets the normal standalone behavior.
  win.setParentWindow(null)
  win.setAlwaysOnTop(true, 'screen-saver')
  sendWhenReady(win, 'overlay:previewMode', false)
  captureFocus()

  const config = loadConfig()
  const active = findActive(config)
  const cols = active?.page.cols ?? DEFAULT_COLS
  const rows = active?.page.rows ?? DEFAULT_ROWS
  const { width, height } = overlaySize(cols, rows, config.gridStyle, config.showPageDots, closeZoneFor(config))
  const cursor = screen.getCursorScreenPoint()

  win.setBounds(boundsAround(cursor.x, cursor.y, width, height))
  // Only draggable (via the hamburger handle) in pinned mode — a normal popup shouldn't move.
  win.setMovable(config.pinned)
  win.setIgnoreMouseEvents(false)
  win.showInactive()
  // The window is focusable:false so it can never blur-to-hide on an outside click; Escape is
  // the dismiss key instead, live only while the overlay is actually up.
  globalShortcut.register('Escape', () => hideOverlay())
}

/**
 * If the real (non-preview) overlay is currently open, adjusts its window size to match a
 * close-zone margin change — e.g. toggling pinned mode, which drops the margin to 0 — by growing
 * or shrinking by exactly the margin delta on each side, around the window's current center.
 * A plain recompute-from-cols/rows can't be used here: main doesn't know if the overlay is
 * currently showing the top page or a folder drilled into (that navigation lives in the
 * renderer), but the delta is the same either way since only the margin changed.
 */
export function syncCloseZoneIfOpen(previous: AppConfig, next: AppConfig): void {
  const win = getExistingOverlayWindow()
  if (!win || !win.isVisible() || win.getParentWindow()) return
  const oldMargin = closeZoneFor(previous).margin
  const newMargin = closeZoneFor(next).margin
  if (oldMargin === newMargin) return
  const delta = (newMargin - oldMargin) * 2
  const current = win.getBounds()
  const width = Math.max(1, current.width + delta)
  const height = Math.max(1, current.height + delta)
  const centerX = current.x + current.width / 2
  const centerY = current.y + current.height / 2
  win.setBounds(boundsAround(centerX, centerY, width, height))
}

/** Re-sizes the open overlay in place (keeping its current center) when an in-overlay page
 *  switch lands on a page with different grid dimensions. */
export function resizeOverlayForPage(cols: number, rows: number): void {
  const win = getExistingOverlayWindow()
  if (!win) return
  const config = loadConfig()
  const { width, height } = overlaySize(cols, rows, config.gridStyle, config.showPageDots, closeZoneFor(config))
  const current = win.getBounds()
  const centerX = current.x + current.width / 2
  const centerY = current.y + current.height / 2
  win.setBounds(boundsAround(centerX, centerY, width, height))
}

/** Positions the overlay window pinned to the right of the editor window, sized to (width, height). */
function boundsBesideEditor(width: number, height: number): { x: number; y: number; width: number; height: number } {
  if (editorWin && !editorWin.isDestroyed()) {
    const eb = editorWin.getBounds()
    return boundsAround(eb.x + eb.width + 24 + width / 2, eb.y + eb.height / 2, width, height)
  }
  const area = screen.getPrimaryDisplay().workArea
  return boundsAround(area.x + area.width / 2, area.y + area.height / 2, width, height)
}

let previewFollow: { move: () => void; minimize: () => void; restore: () => void } | null = null

/** While previewing, keep the overlay stuck beside the editor window as it's dragged around,
 *  and hide/show it in step with the editor being minimized/restored. */
function startPreviewFollow(): void {
  if (previewFollow || !editorWin || editorWin.isDestroyed()) return
  const move = (): void => {
    const win = getExistingOverlayWindow()
    if (!win || !win.isVisible()) return
    const bounds = win.getBounds()
    win.setBounds(boundsBesideEditor(bounds.width, bounds.height))
  }
  const minimize = (): void => {
    getExistingOverlayWindow()?.hide()
  }
  const restore = (): void => {
    const win = getExistingOverlayWindow()
    if (!win) return
    const bounds = win.getBounds()
    win.setBounds(boundsBesideEditor(bounds.width, bounds.height))
    win.showInactive()
  }
  editorWin.on('move', move)
  editorWin.on('minimize', minimize)
  editorWin.on('restore', restore)
  previewFollow = { move, minimize, restore }
}

function stopPreviewFollow(): void {
  if (previewFollow && editorWin && !editorWin.isDestroyed()) {
    editorWin.removeListener('move', previewFollow.move)
    editorWin.removeListener('minimize', previewFollow.minimize)
    editorWin.removeListener('restore', previewFollow.restore)
  }
  previewFollow = null
}

/**
 * Shows the real overlay window as a live settings preview: same window, same rendering,
 * so it can never look different from the popup you actually get from the hotkey. Safe to
 * call repeatedly (e.g. on every settings-field change) — it just re-sizes/re-syncs in place.
 * Stays pinned beside the editor window, following it as it moves/minimizes/restores. It's a
 * child of the editor window (not always-on-top) so the two behave as one thing: minimize, hide
 * behind other apps, and close together. Purely visual — clicks pass through instead of firing
 * real actions, and it's not resizable/movable by the user (that was tried and was buggier than
 * it was worth; size/position are set from the fields only).
 */
export function previewOverlay(config: AppConfig): void {
  const win = getOverlayWindow()
  const active = findActive(config)
  const cols = active?.page.cols ?? DEFAULT_COLS
  const rows = active?.page.rows ?? DEFAULT_ROWS
  const { width, height } = overlaySize(cols, rows, config.gridStyle, config.showPageDots, closeZoneFor(config))

  const wasVisible = win.isVisible()
  if (editorWin && !editorWin.isDestroyed()) win.setParentWindow(editorWin)
  win.setAlwaysOnTop(false)
  win.setIgnoreMouseEvents(true)
  win.setBounds(boundsBesideEditor(width, height))
  startPreviewFollow()

  sendWhenReady(win, 'config:updated', config)
  sendWhenReady(win, 'overlay:previewMode', true)

  const editorMinimized = editorWin && !editorWin.isDestroyed() && editorWin.isMinimized()
  if (!wasVisible && !editorMinimized) win.showInactive()
}

/** Ends a settings-preview session: stop following the editor window, restore normal
 *  standalone-popup behavior, and hide the overlay. */
export function stopOverlayPreview(): void {
  stopPreviewFollow()
  const win = getExistingOverlayWindow()
  if (win) {
    win.setParentWindow(null)
    win.setAlwaysOnTop(true, 'screen-saver')
  }
  hideOverlay()
}

export function hideOverlay(): void {
  if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape')
  if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) {
    overlayWin.hide()
  }
}

export function createEditorWindow(): void {
  if (editorWin && !editorWin.isDestroyed()) {
    editorWin.show()
    editorWin.focus()
    return
  }
  editorWin = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 820,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#15161a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })

  editorWin.on('ready-to-show', () => editorWin?.show())
  editorWin.on('closed', () => {
    editorWin = null
  })
  editorWin.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    editorWin.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    editorWin.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

export function getEditorWindow(): BrowserWindow | null {
  return editorWin
}
