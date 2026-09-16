import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { RunningApp } from '../shared/types'

const execFileAsync = promisify(execFile)

interface RawProc {
  ProcessName: string
  MainWindowTitle: string
  Path: string | null
}

/** Lists currently running programs that have a visible window, each with its exe path and icon. */
export async function listRunningApps(): Promise<RunningApp[]> {
  const script =
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' +
    "Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and $_.Path } " +
    '| Select-Object ProcessName,MainWindowTitle,Path | ConvertTo-Json -Compress'

  let stdout: string
  try {
    const result = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { windowsHide: true, timeout: 8000 }
    )
    stdout = result.stdout
  } catch {
    return []
  }

  let parsed: RawProc | RawProc[]
  try {
    parsed = JSON.parse(stdout || '[]')
  } catch {
    return []
  }
  const list = Array.isArray(parsed) ? parsed : [parsed]

  const seen = new Set<string>([process.execPath])
  const apps: { name: string; title: string; path: string }[] = []
  for (const p of list) {
    if (!p.Path || seen.has(p.Path)) continue
    seen.add(p.Path)
    apps.push({ name: p.ProcessName, title: p.MainWindowTitle, path: p.Path })
  }
  apps.sort((a, b) => a.name.localeCompare(b.name))

  return Promise.all(
    apps.map(async (a) => {
      try {
        const icon = await app.getFileIcon(a.path, { size: 'normal' })
        return { ...a, icon: icon.toDataURL() }
      } catch {
        return { ...a, icon: null }
      }
    })
  )
}
