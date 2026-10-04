export type ThemePref = 'light' | 'dark' | 'system'

export function applyTheme(theme: ThemePref): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}
