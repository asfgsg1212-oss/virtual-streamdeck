import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { readFileSync } from 'fs'
import { extname } from 'path'
import { loadConfig, saveConfig } from './config'
import { executeAction } from './actions'
import {
  hideOverlay,
  getExistingOverlayWindow,
  getEditorWindow,
  resizeOverlayForPage,
  previewOverlay,
  stopOverlayPreview
} from './windows'
import { listRunningApps } from './apps'
import { AppConfig, ButtonAction } from '../shared/types'

interface IpcDeps {
  onHotkeyChange: (combo: string) => boolean
  onTrayRefresh: () => void
}

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

async function openDialog(
  options: Electron.OpenDialogOptions
): Promise<Electron.OpenDialogReturnValue> {
  const win = BrowserWindow.getFocusedWindow()
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}

export function registerIpcHandlers(deps: IpcDeps): void {
  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('config:get', () => loadConfig())

  ipcMain.handle('config:save', (_e, config: AppConfig) => {
    const previous = loadConfig()
    saveConfig(config)

    let hotkeyError = false
    if (previous.hotkey !== config.hotkey) {
      hotkeyError = !deps.onHotkeyChange(config.hotkey)
    }
    if (previous.autoLaunch !== config.autoLaunch) {
      app.setLoginItemSettings({ openAtLogin: config.autoLaunch })
    }
    deps.onTrayRefresh()

    // Push the fresh config to an already-open overlay so edits apply immediately,
    // without waiting for it to be closed/reopened.
    const overlay = getExistingOverlayWindow()
    overlay?.setMovable(config.pinned)
    overlay?.webContents.send('config:updated', config)

    return { hotkeyError }
  })

  ipcMain.handle('action:execute', async (_e, action: ButtonAction) => {
    await executeAction(action)
  })

  ipcMain.handle('overlay:hide', () => {
    hideOverlay()
  })

  ipcMain.handle('overlay:resizeForPage', (_e, cols: number, rows: number) => {
    resizeOverlayForPage(cols, rows)
  })

  ipcMain.handle('overlay:preview', (_e, config: AppConfig) => {
    previewOverlay(config)
  })

  ipcMain.handle('overlay:stopPreview', () => {
    stopOverlayPreview()
  })

  // The overlay's own pin button flips this directly, without going through the editor's
  // Settings save flow — still the same persisted setting, just toggled from either side.
  ipcMain.handle('config:togglePinned', () => {
    const config = loadConfig()
    config.pinned = !config.pinned
    saveConfig(config)

    const overlay = getExistingOverlayWindow()
    overlay?.setMovable(config.pinned)
    overlay?.webContents.send('config:updated', config)
    getEditorWindow()?.webContents.send('config:updated', config)

    return config.pinned
  })

  ipcMain.handle('update:download', () => {
    autoUpdater.downloadUpdate()
  })

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('apps:listRunning', () => listRunningApps())

  ipcMain.handle('dialog:pickFile', async () => {
    const result = await openDialog({
      properties: ['openFile'],
      filters: [
        { name: '실행 파일', extensions: ['exe', 'lnk', 'bat', 'cmd'] },
        { name: '모든 파일', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:pickImage', async () => {
    const result = await openDialog({
      properties: ['openFile'],
      filters: [{ name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    const mime = IMAGE_MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
    const data = readFileSync(path).toString('base64')
    return `data:${mime};base64,${data}`
  })
}
