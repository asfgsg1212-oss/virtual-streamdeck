import type { DeckApi } from './index'

declare global {
  interface Window {
    deck: DeckApi
  }
}
