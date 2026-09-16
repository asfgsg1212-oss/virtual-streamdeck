import { BrowserWindow, screen, shell, globalShortcut } from 'electron'
import { join } from 'path'
import { is } from './env'
import { overlaySize, DEFAULT_COLS, DEFAULT_ROWS } from '../shared/constants'
import { captureFocus } from './actions'
import { loadConfig } from './config'
import { findActive } from '../shared/selectors'
import type { AppConfig } from '../shared/types'

/** Sends once the page has actually loaded, instead of dropping the message on the floor. */
function sendWhenReady(win: BrowserWindow, channel: string, ...args: unknown[]): void {
  const run = (): void => win.webContents.send(channel, ...args)
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', run)
  else run()
}

let overlayWin: BrowserWindow | null = null
let editorWin: BrowserWindow | null = null
// The config previewOverlay() was last called with, so reportGridDrag() can work out the box
// size for a live cellWidth/cellHeight drag without the renderer having to resend everything.
let lastPreviewConfig: AppConfig | null = null

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
  stopPreviewResizeWatch(win)
  // In case this window was left in settings-preview mode (child of the editor, resizable,
  // not always-on-top) — the real hotkey popup always gets the normal standalone behavior.
  win.setParentWindow(null)
  win.setResizable(false)
  win.setMovable(false)
  win.setAlwaysOnTop(true, 'screen-saver')
  sendWhenReady(win, 'overlay:previewMode', false)
  captureFocus()

  const config = loadConfig()
  const active = findActive(config)
  const cols = active?.page.cols ?? DEFAULT_COLS
  const rows = active?.page.rows ?? DEFAULT_ROWS
  const { width, height } = overlaySize(cols, rows, config.gridStyle, config.showPageDots, config.closeZone)
  const cursor = screen.getCursorScreenPoint()

  win.setBounds(boundsAround(cursor.x, cursor.y, width, height))
  win.setIgnoreMouseEvents(false)
  win.showInactive()
  // The window is focusable:false so it can never blur-to-hide on an outside click; Escape is
  // the dismiss key instead, live only while the overlay is actually up.
  globalShortcut.register('Escape', () => hideOverlay())
}

/** Re-sizes the open overlay in place (keeping its current center) when an in-overlay page
 *  switch lands on a page with different grid dimensions. */
export function resizeOverlayForPage(cols: number, rows: number): void {
  const win = getExistingOverlayWindow()
  if (!win) return
  const config = loadConfig()
  const { width, height } = overlaySize(cols, rows, config.gridStyle, config.showPageDots, config.closeZone)
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

/** Re-sizes around the window's own current center — no relation to the editor's position.
 *  Used for every preview resize except the very first, so nothing ever fights a user drag by
 *  snapping the box back to "beside the editor." */
function resizeInPlace(win: BrowserWindow, width: number, height: number): void {
  const current = win.getBounds()
  const centerX = current.x + current.width / 2
  const centerY = current.y + current.height / 2
  setPreviewBounds(win, boundsAround(centerX, centerY, width, height))
}

let previewFollow: { move: () => void; minimize: () => void; restore: () => void } | null = null
// Set around every setBounds() we make ourselves while previewing, so the 'resize' watcher below
// can tell "we just repositioned/resized this" apart from "the user actually dragged an edge."
let suppressPreviewBoundsEvents = false

function setPreviewBounds(win: BrowserWindow, bounds: { x: number; y: number; width: number; height: number }): void {
  suppressPreviewBoundsEvents = true
  win.setBounds(bounds)
  setImmediate(() => {
    suppressPreviewBoundsEvents = false
  })
}

/** While previewing, keep the overlay stuck beside the editor window as it's dragged around
 *  (unless the user has since dragged the overlay itself — see previewResize below), and
 *  hide/show it in step with the editor being minimized/restored. */
function startPreviewFollow(): void {
  if (previewFollow || !editorWin || editorWin.isDestroyed()) return
  const move = (): void => {
    const win = getExistingOverlayWindow()
    if (!win || !win.isVisible()) return
    const bounds = win.getBounds()
    setPreviewBounds(win, boundsBesideEditor(bounds.width, bounds.height))
  }
  const minimize = (): void => {
    getExistingOverlayWindow()?.hide()
  }
  const restore = (): void => {
    const win = getExistingOverlayWindow()
    if (!win) return
    const bounds = win.getBounds()
    setPreviewBounds(win, boundsBesideEditor(bounds.width, bounds.height))
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

let previewResizeListener: (() => void) | null = null

/** While previewing, dragging the overlay's own edge reports the new size back to Settings
 *  (as cellWidth/cellHeight, worked out from the box) instead of just resizing visually. */
function startPreviewResizeWatch(win: BrowserWindow): void {
  if (previewResizeListener) return
  previewResizeListener = (): void => {
    if (suppressPreviewBoundsEvents) return
    const editor = getEditorWindow()
    if (!editor || editor.isDestroyed()) return
    const bounds = win.getBounds()
    editor.webContents.send('overlay:previewResized', { width: bounds.width, height: bounds.height })
  }
  win.on('resize', previewResizeListener)
}

function stopPreviewResizeWatch(win: BrowserWindow): void {
  if (previewResizeListener) {
    win.removeListener('resize', previewResizeListener)
    previewResizeListener = null
  }
}

/**
 * Shows the real overlay window as a live settings preview: same window, same rendering,
 * so it can never look different from the popup you actually get from the hotkey. Safe to
 * call repeatedly (e.g. on every settings-field change) — it just re-sizes/re-syncs in place.
 * Stays pinned beside the editor window, following it as it moves/minimizes/restores. It's a
 * child of the editor window (not always-on-top) so the two behave as one thing: minimize, hide
 * behind other apps, and close together, and the user can freely drag/resize the box itself.
 */
export function previewOverlay(config: AppConfig): void {
  const win = getOverlayWindow()
  const active = findActive(config)
  const cols = active?.page.cols ?? DEFAULT_COLS
  const rows = active?.page.rows ?? DEFAULT_ROWS
  const { width, height } = overlaySize(cols, rows, config.gridStyle, config.showPageDots, config.closeZone)

  const wasVisible = win.isVisible()
  if (editorWin && !editorWin.isDestroyed()) win.setParentWindow(editorWin)
  win.setAlwaysOnTop(false)
  win.setResizable(true)
  win.setMovable(true)
  win.setIgnoreMouseEvents(false)
  // Only the first time this session does the box jump to "beside the editor" — every later
  // resize (a field edit, or feedback from the user dragging the box itself) just resizes it
  // around wherever it currently is, so a drag is never fought back into that fixed spot.
  if (wasVisible) resizeInPlace(win, width, height)
  else setPreviewBounds(win, boundsBesideEditor(width, height))
  startPreviewFollow()
  startPreviewResizeWatch(win)
  lastPreviewConfig = config

  sendWhenReady(win, 'config:updated', config)
  sendWhenReady(win, 'overlay:previewMode', true)

  const editorMinimized = editorWin && !editorWin.isDestroyed() && editorWin.isMinimized()
  if (!wasVisible && !editorMinimized) win.showInactive()
}

/**
 * Called (repeatedly, live) while the user drags the in-page grid-size handle during preview.
 * The window's outer edge controls the close-zone margin (see the 'resize' watcher above); this
 * is the other, independent control — it keeps the margin fixed and grows/shrinks just the grid,
 * resizing the window to match and reporting the new cellWidth/cellHeight back to Settings.
 */
export function reportGridDrag(cellWidth: number, cellHeight: number): void {
  const win = getExistingOverlayWindow()
  if (!win || !lastPreviewConfig) return
  const config: AppConfig = {
    ...lastPreviewConfig,
    gridStyle: { ...lastPreviewConfig.gridStyle, cellWidth, cellHeight }
  }
  const active = findActive(config)
  const cols = active?.page.cols ?? DEFAULT_COLS
  const rows = active?.page.rows ?? DEFAULT_ROWS
  const { width, height } = overlaySize(cols, rows, config.gridStyle, config.showPageDots, config.closeZone)
  resizeInPlace(win, width, height)

  const editor = getEditorWindow()
  if (editor && !editor.isDestroyed()) {
    editor.webContents.send('overlay:gridDragged', { cellWidth, cellHeight })
  }
}

/** Ends a settings-preview session: stop following the editor window, restore normal
 *  standalone-popup behavior, and hide the overlay. */
export function stopOverlayPreview(): void {
  stopPreviewFollow()
  const win = getExistingOverlayWindow()
  if (win) {
    stopPreviewResizeWatch(win)
    win.setParentWindow(null)
    win.setResizable(false)
    win.setMovable(false)
    win.setAlwaysOnTop(true, 'screen-saver')
  }
  lastPreviewConfig = null
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
