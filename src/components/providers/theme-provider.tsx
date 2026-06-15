'use client'
import * as React from 'react'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}

interface ThemeProviderProps {
  children: React.ReactNode
  attribute?: 'class' | string
  defaultTheme?: Theme
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
  storageKey?: string
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getServerSystemTheme(): ResolvedTheme {
  return 'light'
}

function subscribeSystemTheme(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onStoreChange)
  return () => media.removeEventListener('change', onStoreChange)
}

function applyTheme(
  resolved: ResolvedTheme,
  options: Pick<ThemeProviderProps, 'attribute' | 'enableSystem' | 'disableTransitionOnChange'>,
): void {
  if (typeof document === 'undefined') return

  let transitionStyle: HTMLStyleElement | null = null
  if (options.disableTransitionOnChange) {
    transitionStyle = document.createElement('style')
    transitionStyle.appendChild(document.createTextNode('*{transition:none!important}'))
    document.head.appendChild(transitionStyle)
  }

  const root = document.documentElement
  if (!options.attribute || options.attribute === 'class') {
    root.classList.remove('light', 'dark')
    root.classList.add(resolved)
  } else {
    root.setAttribute(options.attribute, resolved)
  }
  root.style.colorScheme = resolved

  if (transitionStyle) {
    window.getComputedStyle(document.body)
    window.requestAnimationFrame(() => transitionStyle?.remove())
  }
}

export function ThemeProvider({
  children,
  attribute = 'class',
  defaultTheme = 'system',
  enableSystem = true,
  disableTransitionOnChange = false,
  storageKey = 'theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme
    const stored = window.localStorage.getItem(storageKey)
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : defaultTheme
  })
  const systemTheme = React.useSyncExternalStore(
    subscribeSystemTheme,
    getSystemTheme,
    getServerSystemTheme,
  )
  const resolvedTheme: ResolvedTheme =
    theme === 'system' && enableSystem !== false ? systemTheme : theme === 'dark' ? 'dark' : 'light'

  const options = React.useMemo(
    () => ({ attribute, enableSystem, disableTransitionOnChange }),
    [attribute, enableSystem, disableTransitionOnChange],
  )

  React.useEffect(() => {
    applyTheme(resolvedTheme, options)
  }, [options, resolvedTheme])

  const setTheme = React.useCallback(
    (nextTheme: Theme) => {
      window.localStorage.setItem(storageKey, nextTheme)
      setThemeState(nextTheme)
    },
    [storageKey],
  )

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [resolvedTheme, setTheme, theme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de ThemeProvider')
  }
  return context
}
