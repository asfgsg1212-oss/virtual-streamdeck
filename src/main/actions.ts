import { shell, screen, clipboard } from 'electron'
import { keyboard, mouse, Key, Button, Point } from '@nut-tree-fork/nut-js'
import { ButtonAction, MediaKey } from '../shared/types'

keyboard.config.autoDelayMs = 0

let lastCursorPoint: Point | null = null

/** Snapshot the cursor position right before the overlay steals the screen (used by mouseClick actions). */
export function captureFocus(): void {
  try {
    const p = screen.getCursorScreenPoint()
    lastCursorPoint = new Point(p.x, p.y)
  } catch {
    lastCursorPoint = null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// The overlay window is hidden by the renderer (see overlay:hide) before this runs, which lets
// Windows hand keyboard focus back to the previously active app on its own. This small buffer
// just gives that OS-level focus switch time to land before we start sending input.
// ponytail: fixed 120ms guess, not an actual focus-change signal — shorten/replace with a real
// foreground-window check if fast double-presses ever end up targeting the overlay itself.
const FOCUS_SETTLE_MS = 120

async function restoreFocus(): Promise<void> {
  await sleep(FOCUS_SETTLE_MS)
}

const MODIFIER_KEYS: Record<string, Key> = {
  ctrl: Key.LeftControl,
  control: Key.LeftControl,
  alt: Key.LeftAlt,
  shift: Key.LeftShift,
  win: Key.LeftSuper,
  meta: Key.LeftSuper,
  cmd: Key.LeftSuper
}

const NAMED_KEYS: Record<string, Key> = {
  enter: Key.Enter,
  return: Key.Enter,
  esc: Key.Escape,
  escape: Key.Escape,
  tab: Key.Tab,
  space: Key.Space,
  backspace: Key.Backspace,
  delete: Key.Delete,
  home: Key.Home,
  end: Key.End,
  pageup: Key.PageUp,
  pagedown: Key.PageDown,
  up: Key.Up,
  down: Key.Down,
  left: Key.Left,
  right: Key.Right,
  capslock: Key.CapsLock,
  print: Key.Print,
  insert: Key.Insert,
  grave: Key.Grave,
  minus: Key.Minus,
  equal: Key.Equal
}

function resolveKey(token: string): Key | null {
  const t = token.trim().toLowerCase()
  if (t === '') return null
  if (t in MODIFIER_KEYS) return MODIFIER_KEYS[t]
  if (t in NAMED_KEYS) return NAMED_KEYS[t]
  if (/^f(1[0-9]|2[0-4]|[1-9])$/.test(t)) return Key[t.toUpperCase() as keyof typeof Key]
  if (/^[0-9]$/.test(t)) return Key[`Num${t}` as keyof typeof Key]
  if (/^[a-z]$/.test(t)) return Key[t.toUpperCase() as keyof typeof Key]
  return null
}

/** "ctrl+alt+c" -> [Key.LeftControl, Key.LeftAlt, Key.C] */
export function parseHotkey(combo: string): Key[] {
  return combo
    .split('+')
    .map(resolveKey)
    .filter((k): k is Key => k !== null)
}

const MEDIA_KEY_MAP: Record<MediaKey, Key> = {
  mute: Key.AudioMute,
  volumeUp: Key.AudioVolUp,
  volumeDown: Key.AudioVolDown,
  playPause: Key.AudioPlay,
  nextTrack: Key.AudioNext,
  prevTrack: Key.AudioPrev
}

async function pressCombo(keys: Key[]): Promise<void> {
  if (keys.length === 0) return
  await keyboard.pressKey(...keys)
  await keyboard.releaseKey(...keys)
}

// keyboard.type() sends raw key codes, which the target app's active keyboard layout then
// reinterprets — so under a Korean IME layout, the physical "A" key comes out as "ㅁ" instead
// of the literal character we wanted. Pasting via the clipboard sends the exact text regardless
// of layout, so it's used for all text-input buttons instead.
async function typeViaClipboard(text: string): Promise<void> {
  if (!text) return
  const previous = clipboard.readText()
  clipboard.writeText(text)
  await pressCombo([Key.LeftControl, Key.V])
  // Give the target app a moment to read the clipboard before putting the old contents back.
  setTimeout(() => clipboard.writeText(previous), 400)
}

async function clickAtCursor(kind: string): Promise<void> {
  if (lastCursorPoint) await mouse.setPosition(lastCursorPoint)
  if (kind === 'right') await mouse.rightClick()
  else if (kind === 'double') await mouse.doubleClick(Button.LEFT)
  else await mouse.leftClick()
}

// A bare domain like "naver.com" has no URI scheme, so shell.openExternal can't tell it's a
// web address and hands it to Explorer instead of the default browser. Assume https if missing.
function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`
}

async function runSingle(type: string, value: string): Promise<void> {
  switch (type) {
    case 'hotkey':
      await pressCombo(parseHotkey(value))
      break
    case 'text':
      await typeViaClipboard(value)
      break
    case 'media': {
      const key = MEDIA_KEY_MAP[value as MediaKey]
      if (key !== undefined) await pressCombo([key])
      break
    }
    case 'mouseClick':
      await clickAtCursor(value)
      break
    case 'launch':
      await shell.openPath(value)
      break
    case 'url':
      await shell.openExternal(normalizeUrl(value))
      break
    case 'wait':
      await sleep(Math.max(0, Number(value) || 0))
      break
    default:
      break
  }
}

export async function executeAction(action: ButtonAction): Promise<void> {
  const isOsFacing = action.type !== 'launch' && action.type !== 'url'
  if (isOsFacing) await restoreFocus()

  if (action.type === 'macro' && action.steps) {
    for (const step of action.steps) {
      await runSingle(step.type, step.value)
    }
    return
  }
  if (action.type === 'launch' && action.paths?.length) {
    await Promise.all(action.paths.map((p) => shell.openPath(p)))
    return
  }
  if (action.type === 'hotkey' && action.values?.length) {
    for (const v of action.values) await pressCombo(parseHotkey(v))
    return
  }
  if (action.type === 'url' && action.values?.length) {
    for (const v of action.values) await shell.openExternal(normalizeUrl(v))
    return
  }
  await runSingle(action.type, action.value)
}
