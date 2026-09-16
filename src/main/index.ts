import { app, globalShortcut, Menu, Tray, nativeImage, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { is } from './env'
import { loadConfig, saveConfig } from './config'
import { createEditorWindow, toggleOverlay } from './windows'
import { registerIpcHandlers } from './ipc'

let tray: Tray | null = null

// Ask before installing, rather than silently auto-downloading.
autoUpdater.autoDownload = false

let manualUpdateCheck = false

autoUpdater.on('update-available', (info) => {
  dialog
    .showMessageBox({
      type: 'question',
      buttons: ['업데이트', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: '업데이트',
      message: `새 버전(${info.version})이 나왔습니다. 업데이트 하시겠습니까?`
    })
    .then((result) => {
      if (result.response === 0) autoUpdater.downloadUpdate()
    })
  manualUpdateCheck = false
})

autoUpdater.on('update-not-available', () => {
  if (manualUpdateCheck) {
    dialog.showMessageBox({ title: '업데이트 확인', message: '이미 최신 버전이에요.' })
  }
  manualUpdateCheck = false
})

autoUpdater.on('error', (err) => {
  if (manualUpdateCheck) dialog.showErrorBox('업데이트 확인 실패', String(err))
  manualUpdateCheck = false
})

autoUpdater.on('update-downloaded', () => {
  dialog
    .showMessageBox({
      type: 'info',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1,
      title: '업데이트 준비 완료',
      message: '새 버전을 받았어요. 지금 재시작해서 적용할까요?'
    })
    .then((result) => {
      if (result.response === 0) autoUpdater.quitAndInstall()
    })
})

function checkForUpdates(manual: boolean): void {
  if (is.dev) return
  manualUpdateCheck = manual
  autoUpdater.checkForUpdates().catch(() => {})
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
  })

  app.on('window-all-closed', () => {
    // 트레이에 계속 상주
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
  })
}
