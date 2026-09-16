import { contextBridge, ipcRenderer } from 'electron'
import type { AppConfig, ButtonAction, RunningApp } from '../shared/types'

const api = {
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke('config:get'),
  saveConfig: (config: AppConfig): Promise<{ hotkeyError: boolean }> =>
    ipcRenderer.invoke('config:save', config),
  executeAction: (action: ButtonAction): Promise<void> =>
    ipcRenderer.invoke('action:execute', action),
  hideOverlay: (): Promise<void> => ipcRenderer.invoke('overlay:hide'),
  resizeOverlayForPage: (cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke('overlay:resizeForPage', cols, rows),
  previewOverlay: (config: AppConfig): Promise<void> => ipcRenderer.invoke('overlay:preview', config),
  stopOverlayPreview: (): Promise<void> => ipcRenderer.invoke('overlay:stopPreview'),
  downloadUpdate: (): Promise<void> => ipcRenderer.invoke('update:download'),
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install'),
  pickFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFile'),
  listRunningApps: (): Promise<RunningApp[]> => ipcRenderer.invoke('apps:listRunning'),
  pickImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickImage'),
  onConfigUpdated: (cb: (config: AppConfig) => void): (() => void) => {
    const listener = (_e: unknown, config: AppConfig): void => cb(config)
    ipcRenderer.on('config:updated', listener)
    return () => ipcRenderer.removeListener('config:updated', listener)
  },
  onPreviewMode: (cb: (isPreview: boolean) => void): (() => void) => {
    const listener = (_e: unknown, isPreview: boolean): void => cb(isPreview)
    ipcRenderer.on('overlay:previewMode', listener)
    return () => ipcRenderer.removeListener('overlay:previewMode', listener)
  },
  onUpdateAvailable: (cb: (version: string) => void): (() => void) => {
    const listener = (_e: unknown, version: string): void => cb(version)
    ipcRenderer.on('update:available', listener)
    return () => ipcRenderer.removeListener('update:available', listener)
  },
  onUpdateNotAvailable: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('update:notAvailable', listener)
    return () => ipcRenderer.removeListener('update:notAvailable', listener)
  },
  onUpdateError: (cb: (message: string) => void): (() => void) => {
    const listener = (_e: unknown, message: string): void => cb(message)
    ipcRenderer.on('update:error', listener)
    return () => ipcRenderer.removeListener('update:error', listener)
  },
  onUpdateDownloaded: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('update:downloaded', listener)
    return () => ipcRenderer.removeListener('update:downloaded', listener)
  }
}

contextBridge.exposeInMainWorld('deck', api)

export type DeckApi = typeof api
