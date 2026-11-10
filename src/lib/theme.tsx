import { createContext, useContext, useEffect, useLayoutEffect } from 'react'
import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/database.ts'
import { storageProvider } from './storage/index.ts'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ReadingMode = 'continuous' | 'paginated-ltr' | 'paginated-rtl'
export type LibraryLayout = 'grid' | 'list'
export type LibrarySort =
  | 'date-added'
  | 'date-modified'
  | 'last-read'
  | 'completed'
  | 'title'
  | 'author'
export type VoicePreference = string

export type AppSettings = {
  theme: ThemeMode
  readingMode: ReadingMode
  defaultSpeed: number
  preferredVoice: VoicePreference
  libraryLayout: LibraryLayout
  librarySort: LibrarySort
  readerFontSize: number
  readerLineHeight: number
  readerMargins: number
  autoHideTopBar: boolean
}

export const defaultSettings: AppSettings = {
  theme: 'system',
  readingMode: 'continuous',
  defaultSpeed: 1,
  preferredVoice: '',
  libraryLayout: 'grid',
  librarySort: 'date-added',
  readerFontSize: 1.125,
  readerLineHeight: 1.9,
  readerMargins: 1.5,
  autoHideTopBar: true,
}

type SettingsContextValue = {
  settings: AppSettings
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)
let settingsInitialization: Promise<void> | null = null

function initializeSettings() {
  if (!settingsInitialization) {
    settingsInitialization = (async () => {
      await storageProvider.init()
      const current = await db.settings.get('app')
      if (!current) {
        let initialSettings = defaultSettings
        try {
          const legacyTheme = window.localStorage.getItem('liber-theme')
          if (
            legacyTheme === 'light' ||
            legacyTheme === 'dark' ||
            legacyTheme === 'system'
          ) {
            initialSettings = { ...defaultSettings, theme: legacyTheme }
          }
        } catch {
          initialSettings = defaultSettings
        }

        await storageProvider.writeSettings(initialSettings)
      }

      try {
        window.localStorage.removeItem('liber-theme')
      } catch {
        // The database remains the settings source when localStorage is unavailable.
      }
    })()
  }

  return settingsInitialization
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const record = useLiveQuery(() => db.settings.get('app'), [], undefined)
  const settings = record?.value ?? defaultSettings

  useEffect(() => {
    void initializeSettings().catch(() => undefined)
  }, [])

  const updateSettings = async (updates: Partial<AppSettings>) => {
    await initializeSettings()
    const current = await storageProvider.readSettings()
    await storageProvider.writeSettings({ ...current, ...updates })
  }

  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.toggle('light', settings.theme === 'light')
    root.classList.toggle('dark', settings.theme === 'dark')
    root.dataset.theme = settings.theme
  }, [settings.theme])

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>
}

export function useSettings() {
  const value = useContext(SettingsContext)
  if (!value) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return value
}

export function useTheme() {
  const { settings, updateSettings } = useSettings()
  return {
    theme: settings.theme,
    setTheme: (theme: ThemeMode) => updateSettings({ theme }),
  }
}
