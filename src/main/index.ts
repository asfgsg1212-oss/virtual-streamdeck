import { app, globalShortcut, Menu, Tray, nativeImage, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { is } from './env'
import { loadConfig, saveConfig } from './config'
import { createEditorWindow, toggleOverlay } from './windows'
import { registerIpcHandlers } from './ipc'

let tray: Tray | null = null

function registerGlobalHotkey(combo: string): boolean {
  globalShortcut.unregisterAll()
  return globalShortcut.register(combo, () => {
    toggleOverlay()
  })
}

function buildTrayMenu(): Menu {
  const config = loadConfig()
  return Menu.buildFromTemplate([
    { label: '에디터 열기', click: () => createEditorWindow() },
    { type: 'separator' },
    {
      label: 'Windows 시작 시 자동 실행',
      type: 'checkbox',
      checked: config.autoLaunch,
      click: (item) => {
        const cfg = loadConfig()
        cfg.autoLaunch = item.checked
        saveConfig(cfg)
        app.setLoginItemSettings({ openAtLogin: item.checked })
      }
    },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() }
  ])
}

function createTray(): void {
  const icon = nativeImage
    .createFromPath(join(__dirname, '../../resources/icon.png'))
    .resize({ width: 32, height: 32 })
  tray = new Tray(icon)
  tray.setToolTip('Virtual StreamDeck')
  tray.setContextMenu(buildTrayMenu())
  tray.on('double-click', () => createEditorWindow())
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    createEditorWindow()
  })

  app.whenReady().then(() => {
    const config = loadConfig()
    app.setLoginItemSettings({ openAtLogin: config.autoLaunch })

    registerIpcHandlers({
      onHotkeyChange: registerGlobalHotkey,
      onTrayRefresh: () => tray?.setContextMenu(buildTrayMenu())
    })

    createTray()

    const ok = registerGlobalHotkey(config.hotkey)
    if (!ok) {
      dialog.showErrorBox(
        '단축키 등록 실패',
        `"${config.hotkey}" 단축키를 등록하지 못했습니다. 다른 프로그램이 이미 사용 중일 수 있습니다. 에디터의 설정에서 단축키를 바꿔주세요.`
      )
    }

    createEditorWindow()

    // GitHub Releases is the update source (see electron-builder.yml's publish config).
    // No-op in dev (unpackaged), and any check/download failure (e.g. offline) is just ignored.
    if (!is.dev) {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {})
    }
  })

  app.on('window-all-closed', () => {
    // 트레이에 계속 상주
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}
