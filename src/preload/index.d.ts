import type { LexiApi } from './index'

declare global {
  interface Window {
    lexi: LexiApi
  }
}

export {}
