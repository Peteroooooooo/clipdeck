import { useState } from 'react'
import { motion } from 'motion/react'
import {
  AppWindow,
  ArrowCounterClockwise,
  CaretDown,
  CaretLeft,
  CaretRight,
  CaretUp,
  ClipboardText,
  ClockCounterClockwise,
  Drop,
  FloppyDisk,
  Keyboard,
  SlidersHorizontal,
  X,
  type Icon,
} from '@phosphor-icons/react'
import { DEFAULT_APPEARANCE } from '../../app/appearance'
import { useT } from '../../app/i18n'
import type { AppearanceSettings, Language, SettingsState, ShortcutBindings } from '../../app/types'
import { SPRING_SMOOTH } from '../../shared/ui/motionTokens'
import { GlassSections, LiquidSections, type GlassInfo } from './AppearanceSections'
import { ChoiceRow, ToggleRow } from './controls'

export type { GlassInfo }

interface SettingsViewProps {
  settings: SettingsState
  glassInfo?: GlassInfo
  onSave: (settings: SettingsState) => void
  onCancel: () => void
  /** Resolves to the factory shortcuts, which only replace the unsaved draft. */
  onRestoreDefaults: () => Promise<ShortcutBindings>
  onClearAllHistory: () => void
  onPickStoragePath: (currentPath: string) => Promise<string | null>
  /** Called with the unsaved appearance on every edit, so the app can show it live. */
  onPreviewAppearance?: (appearance: AppearanceSettings) => void
}

type Category = 'general' | 'capture' | 'shortcuts' | 'history' | 'glass' | 'liquid'

const CATEGORIES: { key: Category; icon: Icon }[] = [
  { key: 'general', icon: SlidersHorizontal },
  { key: 'capture', icon: ClipboardText },
  { key: 'shortcuts', icon: Keyboard },
  { key: 'history', icon: ClockCounterClockwise },
  { key: 'glass', icon: AppWindow },
  { key: 'liquid', icon: Drop },
]

// Each language is named in itself, so it can be found whatever the app is showing.
const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
]

const SHORTCUT_KEYS: (keyof ShortcutBindings)[] = ['togglePanel', 'primaryAction', 'pastePlainText', 'togglePin', 'deleteRecord']

const HISTORY_LIMIT_MIN = 1
const HISTORY_LIMIT_MAX = 5000

function ShortcutRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="shortcut-row">
      <span className="field-label">
        <strong>{label}</strong>
      </span>
      <input className="field-input" onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  )
}

function FolderRow({
  label,
  description,
  value,
  browseLabel,
  testId,
  onBrowse,
}: {
  label: string
  description: string
  value: string
  browseLabel?: string
  testId: string
  onBrowse: () => void
}) {
  const t = useT()
  return (
    <div className="field-row field-row-storage">
      <div className="field-label">
        <strong>{label}</strong>
        <span>{description}</span>
      </div>
      <div className="storage-path-stack" data-testid={`${testId}-stack`}>
        <div className="storage-path-value" data-testid={`${testId}-value`} title={value}>
          {value}
        </div>
        <button aria-label={browseLabel} className="ghost-button storage-path-browse" onClick={onBrowse} type="button">
          {t.settings.browse}
        </button>
      </div>
    </div>
  )
}

function clampHistoryLimit(value: number) {
  if (!Number.isFinite(value)) {
    return HISTORY_LIMIT_MIN
  }

  return Math.min(HISTORY_LIMIT_MAX, Math.max(HISTORY_LIMIT_MIN, Math.trunc(value)))
}

const NO_GLASS: GlassInfo = { mode: null, liveAvailable: false }

export function SettingsView({
  settings,
  glassInfo = NO_GLASS,
  onSave,
  onCancel,
  onRestoreDefaults,
  onClearAllHistory,
  onPickStoragePath,
  onPreviewAppearance,
}: SettingsViewProps) {
  const t = useT()
  const [draft, setDraft] = useState(settings)
  // The list of categories (null), or one category's page.
  const [page, setPage] = useState<Category | null>(null)
  // Pages come in from the right, the list comes back from the left.
  const [forward, setForward] = useState(true)

  const openPage = (next: Category | null) => {
    setForward(next !== null)
    setPage(next)
  }

  const setAppearance = (appearance: AppearanceSettings) => {
    setDraft((currentDraft) => ({ ...currentDraft, appearance }))
    onPreviewAppearance?.(appearance)
  }
  const [historyLimitInput, setHistoryLimitInput] = useState(String(settings.historyLimit))

  const updateHistoryLimit = (value: number) => {
    const nextValue = clampHistoryLimit(value)
    setDraft((currentDraft) => ({
      ...currentDraft,
      historyLimit: nextValue,
    }))
    setHistoryLimitInput(String(nextValue))
  }

  // Snapshots are pushed whenever anything changes (e.g. a new clip arrives), each with a
  // fresh settings object. Only reset the draft when the saved values actually change,
  // otherwise background pushes would wipe what the user is typing.
  const settingsKey = JSON.stringify(settings)
  const [syncedSettingsKey, setSyncedSettingsKey] = useState(settingsKey)

  if (settingsKey !== syncedSettingsKey) {
    setSyncedSettingsKey(settingsKey)
    setDraft(settings)
    setHistoryLimitInput(String(settings.historyLimit))
  }

  const pickFolder = (current: string, apply: (path: string) => void) =>
    void onPickStoragePath(current).then((selectedPath) => {
      if (selectedPath) apply(selectedPath)
    })

  const toggle = (key: 'launchOnStartup' | 'recordText' | 'recordRichText' | 'recordImages' | 'recordFiles') =>
    setDraft((currentDraft) => ({ ...currentDraft, [key]: !currentDraft[key] }))

  const resetAppearance = () => setAppearance(DEFAULT_APPEARANCE)
  const changeAppearance = (patch: Partial<AppearanceSettings>) => setAppearance({ ...draft.appearance, ...patch })

  const renderPage = (category: Category) => {
    switch (category) {
      case 'general':
        return (
          <div className="settings-grid">
            <ToggleRow
              checked={draft.launchOnStartup}
              description={t.settings.launchOnStartup[1]}
              label={t.settings.launchOnStartup[0]}
              onClick={() => toggle('launchOnStartup')}
            />
            <ChoiceRow<Language>
              description={t.settings.language[1]}
              label={t.settings.language[0]}
              onChange={(language) => setDraft((currentDraft) => ({ ...currentDraft, language }))}
              options={LANGUAGES}
              value={draft.language}
            />
          </div>
        )
      case 'capture':
        return (
          <div className="settings-grid">
            {(['recordText', 'recordRichText', 'recordImages', 'recordFiles'] as const).map((key) => (
              <ToggleRow
                checked={draft[key]}
                description={t.settings[key][1]}
                key={key}
                label={t.settings[key][0]}
                onClick={() => toggle(key)}
              />
            ))}
          </div>
        )
      case 'shortcuts':
        return (
          <>
            <div className="shortcut-grid">
              {SHORTCUT_KEYS.map((key) => (
                <ShortcutRow
                  key={key}
                  label={t.settings.shortcuts[key]}
                  onChange={(value) =>
                    setDraft((currentDraft) => ({ ...currentDraft, shortcuts: { ...currentDraft.shortcuts, [key]: value } }))
                  }
                  value={draft.shortcuts[key]}
                />
              ))}
            </div>
            <button
              className="ghost-button section-reset"
              onClick={() =>
                void onRestoreDefaults().then((shortcuts) => setDraft((currentDraft) => ({ ...currentDraft, shortcuts })))
              }
              type="button"
            >
              <ArrowCounterClockwise size={14} weight="bold" />
              {t.settings.shortcuts.restore}
            </button>
          </>
        )
      case 'history':
        return (
          <>
            <div className="settings-grid">
              <label className="field-row">
                <span className="field-label">
                  <strong>{t.settings.historyLimit[0]}</strong>
                  <span>{t.settings.historyLimit[1]}</span>
                </span>
                <div className="stepper-control">
                  <input
                    aria-label={t.settings.historyLimit[0]}
                    className="stepper-input"
                    inputMode="numeric"
                    max={HISTORY_LIMIT_MAX}
                    min={HISTORY_LIMIT_MIN}
                    onBlur={() => {
                      if (historyLimitInput.trim() === '') {
                        setHistoryLimitInput(String(draft.historyLimit))
                      }
                    }}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      setHistoryLimitInput(nextValue)

                      if (nextValue.trim() === '') {
                        return
                      }

                      updateHistoryLimit(Number(nextValue))
                    }}
                    type="number"
                    value={historyLimitInput}
                  />
                  <div className="stepper-buttons">
                    <button
                      aria-label={t.settings.increaseLimit}
                      className="stepper-button"
                      onClick={() => updateHistoryLimit(draft.historyLimit + 1)}
                      type="button"
                    >
                      <CaretUp size={12} weight="bold" />
                    </button>
                    <button
                      aria-label={t.settings.decreaseLimit}
                      className="stepper-button"
                      onClick={() => updateHistoryLimit(draft.historyLimit - 1)}
                      type="button"
                    >
                      <CaretDown size={12} weight="bold" />
                    </button>
                  </div>
                </div>
              </label>
              <FolderRow
                description={t.settings.storagePath[1]}
                label={t.settings.storagePath[0]}
                onBrowse={() =>
                  pickFolder(draft.storagePath, (storagePath) => setDraft((currentDraft) => ({ ...currentDraft, storagePath })))
                }
                testId="storage-path"
                value={draft.storagePath}
              />
              <FolderRow
                browseLabel={t.settings.browseImageFolder}
                description={t.settings.imageSavePath[1]}
                label={t.settings.imageSavePath[0]}
                onBrowse={() =>
                  pickFolder(draft.imageSavePath, (imageSavePath) =>
                    setDraft((currentDraft) => ({ ...currentDraft, imageSavePath })),
                  )
                }
                testId="image-save-path"
                value={draft.imageSavePath}
              />
            </div>
            <section aria-labelledby="data-heading" className="settings-section settings-section-danger">
              <h2 id="data-heading">{t.settings.dataHeading}</h2>
              <div className="settings-grid">
                <div className="field-row field-row-actions">
                  <div className="field-label">
                    <strong>{t.settings.clearAll[0]}</strong>
                    <span>{t.settings.clearAll[1]}</span>
                  </div>
                  <button className="danger-button" onClick={onClearAllHistory} type="button">
                    {t.settings.clearAllButton}
                  </button>
                </div>
              </div>
            </section>
          </>
        )
      case 'glass':
        return (
          <GlassSections appearance={draft.appearance} glassInfo={glassInfo} onChange={changeAppearance} onReset={resetAppearance} />
        )
      case 'liquid':
        return (
          <LiquidSections appearance={draft.appearance} glassInfo={glassInfo} onChange={changeAppearance} onReset={resetAppearance} />
        )
    }
  }

  const title = page ? t.settings.categories[page][0] : t.settings.title
  const subtitle = page ? t.settings.categories[page][1] : t.settings.subtitle

  return (
    <section className="settings-shell">
      <header className="settings-header">
        <button
          aria-label={t.settings.back}
          className="icon-button"
          onClick={() => (page ? openPage(null) : onCancel())}
          title={t.settings.back}
          type="button"
        >
          <CaretLeft size={17} weight="bold" />
        </button>
        <div className="window-drag-region settings-title">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </header>

      {/* Keyed by page: each page starts at the top and slides in from the side it comes from. */}
      <motion.div
        animate={{ opacity: 1, x: 0 }}
        className="settings-scroll"
        initial={{ opacity: 0, x: forward ? 18 : -18 }}
        key={page ?? 'home'}
        transition={SPRING_SMOOTH}
      >
        {page ? (
          renderPage(page)
        ) : (
          <nav aria-label={t.settings.title} className="settings-grid settings-nav">
            {CATEGORIES.map(({ key, icon: CategoryIcon }) => (
              <button className="field-row settings-nav-row" key={key} onClick={() => openPage(key)} type="button">
                <span aria-hidden="true" className="settings-nav-icon">
                  <CategoryIcon size={16} weight="bold" />
                </span>
                <span className="field-label">
                  <strong>{t.settings.categories[key][0]}</strong>
                  <span>{t.settings.categories[key][1]}</span>
                </span>
                <CaretRight aria-hidden="true" className="settings-nav-caret" size={14} weight="bold" />
              </button>
            ))}
          </nav>
        )}
      </motion.div>

      <footer className="settings-footer">
        <button className="ghost-button" onClick={onCancel} type="button">
          <X size={14} weight="bold" />
          {t.settings.cancel}
        </button>
        <button className="primary-button" onClick={() => onSave(draft)} type="button">
          <FloppyDisk size={15} />
          {t.settings.save}
        </button>
      </footer>
    </section>
  )
}
