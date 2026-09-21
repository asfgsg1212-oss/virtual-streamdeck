import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const sharedAlias = { '@shared': resolve('src/shared') }

// Issues-only token for the in-app feedback button. Kept out of git (feedback-token.txt is
// ignored) and only baked into the local build; without it the button falls back to opening a
// prefilled GitHub issue page.
const tokenFile = resolve('feedback-token.txt')
const feedbackToken = (
  process.env.FEEDBACK_TOKEN ?? (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf-8') : '')
).trim()

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()],
    define: { __FEEDBACK_TOKEN__: JSON.stringify(feedbackToken) }
  },
  preload: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        ...sharedAlias,
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    // electron-vite's types mis-attribute `rollupOptions` to the wrong member of an
    // internal union here even though it's valid `BuildEnvironmentOptions`; runtime is fine.
    build: {
      rollupOptions: {
        input: {
          editor: resolve(__dirname, 'src/renderer/index.html'),
          overlay: resolve(__dirname, 'src/renderer/overlay.html')
        }
      }
    } as any // eslint-disable-line @typescript-eslint/no-explicit-any
  }
})
