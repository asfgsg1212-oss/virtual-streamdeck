import { app, shell } from 'electron'
import os from 'os'

const REPO = 'asfgsg1212-oss/virtual-streamdeck'
const MAX_LEN = 2000
const COOLDOWN_MS = 30_000

// Injected at build time from feedback-token.txt (gitignored): a fine-grained token that can only
// read/write issues on this one repo. Empty in a build made without it — see the fallback below.
declare const __FEEDBACK_TOKEN__: string
const TOKEN: string = typeof __FEEDBACK_TOKEN__ === 'string' ? __FEEDBACK_TOKEN__ : ''

let lastSentAt = 0

export interface FeedbackResult {
  ok: boolean
  /** 'issue' = sent straight to GitHub; 'browser' = opened a prefilled issue page instead. */
  mode?: 'issue' | 'browser'
  error?: string
}

function buildIssue(message: string, contact: string): { title: string; body: string } {
  const firstLine = message.split('\n')[0].trim()
  const title = `[피드백] ${firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine}`
  const body = [
    message,
    '',
    '---',
    `- 앱 버전: ${app.getVersion()}`,
    `- OS: ${os.type()} ${os.release()}`,
    contact ? `- 연락처: ${contact}` : ''
  ]
    .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
    .join('\n')
  return { title, body }
}

function openPrefilledIssuePage(title: string, body: string): FeedbackResult {
  const url = `https://github.com/${REPO}/issues/new?labels=feedback&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
  shell.openExternal(url)
  return { ok: true, mode: 'browser' }
}

export async function sendFeedback(rawMessage: string, rawContact: string): Promise<FeedbackResult> {
  const message = rawMessage.trim().slice(0, MAX_LEN)
  if (!message) return { ok: false, error: '내용을 적어주세요.' }
  const wait = COOLDOWN_MS - (Date.now() - lastSentAt)
  if (wait > 0) return { ok: false, error: `조금만 있다가 다시 보내주세요 (${Math.ceil(wait / 1000)}초).` }

  const { title, body } = buildIssue(message, rawContact.trim().slice(0, 100))
  if (!TOKEN) return openPrefilledIssuePage(title, body)

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'virtual-streamdeck-feedback',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, body, labels: ['feedback'] })
    })
    if (res.ok) {
      lastSentAt = Date.now()
      return { ok: true, mode: 'issue' }
    }
    // Expired/revoked token or a permissions problem: don't lose the message, hand it to the browser.
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return openPrefilledIssuePage(title, body)
    }
    return { ok: false, error: `전송에 실패했어요 (${res.status}). 잠시 뒤 다시 해주세요.` }
  } catch {
    return { ok: false, error: '인터넷에 연결되어 있는지 확인해주세요.' }
  }
}
