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
  onPreviewResized: (cb: (size: { width: number; height: number }) => void): (() => void) => {
    const listener = (_e: unknown, size: { width: number; height: number }): void => cb(size)
    ipcRenderer.on('overlay:previewResized', listener)
    return () => ipcRenderer.removeListener('overlay:previewResized', listener)
  }
}

contextBridge.exposeInMainWorld('deck', api)

export type DeckApi = typeof api
