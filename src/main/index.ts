import { app, globalShortcut, Menu, Tray, nativeImage, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { is } from './env'
import { loadConfig, saveConfig } from './config'
import { createEditorWindow, toggleOverlay } from './windows'
import { registerIpcHandlers } from './ipc'

let tray: Tray | null = null

const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

// The app lives in the tray and can stay open for days, so checking only once at launch means
// a build released after that point never gets picked up until the user happens to restart. This
// re-checks periodically too, and (when manual) reports back either way instead of staying silent.
function checkForUpdates(manual: boolean): void {
  if (is.dev) return
  autoUpdater
    .checkForUpdatesAndNotify()
    .then((result) => {
      if (!manual) return
      const latest = result?.updateInfo?.version
      if (latest && latest !== app.getVersion()) {
        dialog.showMessageBox({
          title: '업데이트 확인',
          message: `새 버전 ${latest}을(를) 받고 있어요. 준비되면 알려드릴게요.`
        })
      } else {
        dialog.showMessageBox({ title: '업데이트 확인', message: '이미 최신 버전이에요.' })
      }
    })
    .catch((err) => {
      if (manual) dialog.showErrorBox('업데이트 확인 실패', String(err))
    })
}

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
    { label: '업데이트 확인', click: () => checkForUpdates(true) },
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

    checkForUpdates(false)
    setInterval(() => checkForUpdates(false), UPDATE_CHECK_INTERVAL_MS)
  })

  app.on('window-all-closed', () => {
    // 트레이에 계속 상주
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}
