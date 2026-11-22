import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import { MotionConfig, motion } from 'motion/react'
import { QuickPanelView } from '../features/panel/QuickPanelView'
import { SettingsView, type GlassInfo } from '../features/settings/SettingsView'
import { LiquidGlassContext } from '../shared/ui/liquid/liquidContext'
import { SPRING_SMOOTH } from '../shared/ui/motionTokens'
import { ToastHost } from '../shared/ui/ToastHost'
import { applyAppearance, DEFAULT_APPEARANCE } from './appearance'
import { I18nContext, stringsFor } from './i18n'
import { desktopApi, subscribeSnapshot } from './pywebview'
import type { AppearanceSettings, AppSnapshot, HistoryRecord, SettingsState } from './types'

function stringArrayEqual(a: string[], b: string[]) {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function recordDisplayEqual(a: HistoryRecord, b: HistoryRecord) {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.summary === b.summary &&
    a.detail === b.detail &&
    a.sourceApp === b.sourceApp &&
    a.sourceGlyph === b.sourceGlyph &&
    a.sourceIcon === b.sourceIcon &&
    a.pinned === b.pinned &&
    a.updatedAt === b.updatedAt &&
    a.imagePath === b.imagePath &&
    a.imageWidth === b.imageWidth &&
    a.imageHeight === b.imageHeight &&
    stringArrayEqual(a.filePaths, b.filePaths)
  )
}

function reconcileRecords(prev: HistoryRecord[], next: HistoryRecord[], byId: Map<string, HistoryRecord>) {
  let allSameRef = prev.length === next.length
  const out = next.map((item, i) => {
    const existing = byId.get(item.id)
    const reused = existing && recordDisplayEqual(existing, item) ? existing : item
    if (allSameRef && reused !== prev[i]) allSameRef = false
    return reused
  })
  return allSameRef ? prev : out
}

function appearanceEqual(a: AppearanceSettings, b: AppearanceSettings): boolean {
  if (a === b) return true
  return (
    a.glassSource === b.glassSource &&
    a.cornerRadius === b.cornerRadius &&
    a.whitePoint === b.whitePoint &&
    a.blackPoint === b.blackPoint &&
    a.backdropBlur === b.backdropBlur &&
    a.backdropSaturation === b.backdropSaturation &&
    a.rimLight === b.rimLight &&
    a.edgeHighlight === b.edgeHighlight &&
    a.textTone === b.textTone &&
    a.textHalo === b.textHalo &&
    a.secondaryTextOpacity === b.secondaryTextOpacity &&
    a.liquidEnabled === b.liquidEnabled &&
    a.liquidMode === b.liquidMode &&
    a.displacementScale === b.displacementScale &&
    a.aberrationIntensity === b.aberrationIntensity &&
    a.elasticity === b.elasticity &&
    a.frost === b.frost &&
    a.liquidSaturation === b.liquidSaturation &&
    a.liquidShade === b.liquidShade &&
    a.animations === b.animations
  )
}

function toastEqual(a: AppSnapshot['toast'], b: AppSnapshot['toast']) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.tone === b.tone &&
    a.actionKind === b.actionKind &&
    JSON.stringify(a.params) === JSON.stringify(b.params)
  )
}

function reconcileSnapshot(prev: AppSnapshot | null, next: AppSnapshot): AppSnapshot {
  if (!prev) return next
  const byId = new Map<string, HistoryRecord>()
  for (const r of prev.pinnedRecords) byId.set(r.id, r)
  for (const r of prev.recentRecords) byId.set(r.id, r)

  const pinnedRecords = reconcileRecords(prev.pinnedRecords, next.pinnedRecords, byId)
  const recentRecords = reconcileRecords(prev.recentRecords, next.recentRecords, byId)
  const settings =
    JSON.stringify(prev.settings) === JSON.stringify(next.settings)
      ? prev.settings
      : appearanceEqual(prev.settings.appearance, next.settings.appearance)
        ? { ...next.settings, appearance: prev.settings.appearance }
        : next.settings
  const toast = toastEqual(prev.toast, next.toast) ? prev.toast : next.toast

  if (
    prev.view === next.view &&
    prev.isRecordingPaused === next.isRecordingPaused &&
    prev.isAlwaysOnTop === next.isAlwaysOnTop &&
    pinnedRecords === prev.pinnedRecords &&
    recentRecords === prev.recentRecords &&
    settings === prev.settings &&
    toast === prev.toast
  ) {
    return prev
  }

  return { ...next, pinnedRecords, recentRecords, settings, toast }
}

// How long slider drags settle before the native window (live blur, snapshot) is updated.
const NATIVE_PREVIEW_DELAY_MS = 220
const PAGE_SETTLE_CALM_MS = 150
const PAGE_SETTLE_CAP_MS = 1500

// Settings slides "forward" (zooms in from slightly larger), the panel comes back from slightly smaller.
const VIEW_ENTER = {
  panel: { opacity: 0, scale: 0.985, filter: 'blur(4px)' },
  settings: { opacity: 0, scale: 1.02, filter: 'blur(4px)' },
} as const

const VIEW_TRANSITION = {
  default: SPRING_SMOOTH,
  opacity: { duration: 0.22, ease: 'easeOut' },
  filter: { duration: 0.28, ease: 'easeOut' },
} as const

function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  // Unsaved appearance from the settings page, shown live until saved or cancelled.
  const [previewAppearance, setPreviewAppearance] = useState<AppearanceSettings | null>(null)
  const [glassInfo, setGlassInfo] = useState<GlassInfo>({ mode: null, liveAvailable: false })

  const savedAppearance = snapshot?.settings.appearance ?? DEFAULT_APPEARANCE
  // Only the settings page previews; anywhere else the saved look applies.
  const activePreview = snapshot?.view === 'settings' ? previewAppearance : null
  const appearance = activePreview ?? savedAppearance

  useEffect(() => applyAppearance(appearance), [appearance])

  const liquidSettings = useMemo(
    // Only the desktop snapshot paints an opaque picture inside the page; live glass (and the
    // browser preview, whose window uses backdrop-filter) leave a translucent backdrop.
    () => ({ ...appearance, translucentBackdrop: glassInfo.mode !== 'snapshot' }),
    [appearance, glassInfo.mode],
  )

  useEffect(() => {
    if (!previewAppearance) {
      return
    }
    const timer = window.setTimeout(() => void desktopApi.previewAppearance(previewAppearance), NATIVE_PREVIEW_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [previewAppearance])

  useEffect(() => {
    const handleGlass = (event: Event) => {
      const detail = (event as CustomEvent<Partial<GlassInfo>>).detail
      setGlassInfo({
        mode: detail?.mode ?? null,
        liveAvailable: Boolean(detail?.liveAvailable),
        filtered: Boolean(detail?.filtered),
      })
    }
    window.addEventListener('clipdeck:glass', handleGlass)
    return () => window.removeEventListener('clipdeck:glass', handleGlass)
  }, [])

  const endAppearancePreview = useCallback(() => {
    setPreviewAppearance(null)
  }, [])

  // Settings can also be left without Cancel or Save (tray "显示主面板"); an unsaved look must not
  // outlive the page that was editing it.
  const strandedPreview = Boolean(previewAppearance) && snapshot !== null && snapshot.view !== 'settings'
  useEffect(() => {
    if (!strandedPreview) {
      return
    }
    void desktopApi.previewAppearance(savedAppearance).then(() => setPreviewAppearance(null))
  }, [strandedPreview, savedAppearance])

  const commitSnapshot = useCallback((nextSnapshot: AppSnapshot) => {
    startTransition(() => {
      setSnapshot((prev) => reconcileSnapshot(prev, nextSnapshot))
    })
  }, [])

  useEffect(() => {
    let mounted = true

    desktopApi.getAppState().then((nextSnapshot) => {
      if (!mounted) {
        return
      }

      commitSnapshot(nextSnapshot)
    })

    const unsubscribe = subscribeSnapshot((nextSnapshot) => {
      commitSnapshot(nextSnapshot)
    })

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [commitSnapshot])

  const hasSnapshot = snapshot !== null
  useEffect(() => {
    if (!hasSnapshot) {
      return
    }
    // A normal launch shows the window only once the panel has settled. Right after the first
    // snapshot, cards are still arriving and nothing is painted yet (measured: ~0.35 s of empty
    // glass, then the list sliding into place); so wait for the same cards over a stretch of
    // smooth frames (frames stall while the panel is still being rasterized). Capped, so a busy
    // machine still shows the panel.
    let frame = 0
    const started = performance.now()
    let cards = -1
    let last = started
    let calmSince = started
    const tick = (now: number) => {
      const count = document.getElementsByClassName('panel-card').length
      if (count !== cards || now - last > 50) calmSince = now
      cards = count
      last = now
      if (now - calmSince >= PAGE_SETTLE_CALM_MS || now - started >= PAGE_SETTLE_CAP_MS) {
        void desktopApi.pageReady()
        return
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [hasSnapshot])

  const syncSnapshot = useCallback(
    async (promise: Promise<AppSnapshot>) => {
      const nextSnapshot = await promise
      commitSnapshot(nextSnapshot)
    },
    [commitSnapshot],
  )

  const handleDismissToast = useCallback(() => {
    void syncSnapshot(desktopApi.dismissToast())
  }, [syncSnapshot])

  const handleToastAction = () => {
    if (snapshot?.toast?.actionKind === 'undo_delete') {
      void syncSnapshot(desktopApi.undoDelete())
    }
  }

  const handleClearHistory = useCallback(() => {
    void syncSnapshot(desktopApi.clearUnpinnedHistory())
  }, [syncSnapshot])

  const handleCopyRecord = useCallback((recordId: string) => void syncSnapshot(desktopApi.copyRecord(recordId)), [syncSnapshot])
  const handleSaveImage = useCallback((recordId: string) => void syncSnapshot(desktopApi.saveImage(recordId)), [syncSnapshot])
  const handleDeleteRecord = useCallback((recordId: string) => void syncSnapshot(desktopApi.deleteRecord(recordId)), [syncSnapshot])
  const handleHideWindow = useCallback(() => void desktopApi.hideWindow(), [])
  const handleOpenSettings = useCallback(() => void syncSnapshot(desktopApi.setView('settings')), [syncSnapshot])
  const handlePastePlainText = useCallback(
    (recordId: string) => void syncSnapshot(desktopApi.pastePlainText(recordId)),
    [syncSnapshot],
  )
  const handlePrimaryAction = useCallback(
    (recordId: string) => void syncSnapshot(desktopApi.triggerPrimaryAction(recordId)),
    [syncSnapshot],
  )
  const handleToggleAlwaysOnTop = useCallback(() => void syncSnapshot(desktopApi.toggleAlwaysOnTop()), [syncSnapshot])
  const handleTogglePause = useCallback(() => void syncSnapshot(desktopApi.togglePause()), [syncSnapshot])
  const handleTogglePin = useCallback((recordId: string) => void syncSnapshot(desktopApi.togglePin(recordId)), [syncSnapshot])

  const handleClearAllHistory = async () => {
    if (!(await desktopApi.confirmClearAllHistory())) {
      return
    }

    await syncSnapshot(desktopApi.clearAllHistory())
  }

  const language = snapshot?.settings.language ?? (navigator.language.startsWith('zh') ? 'zh' : 'en')
  const t = stringsFor(language)
  // Lets the browser pick Chinese glyph forms and line breaking for Chinese text.
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
  }, [language])

  if (!snapshot) {
    return (
      <main className="app-shell">
        <div className="app-loading">{t.loading}</div>
      </main>
    )
  }

  const frame =
    snapshot.view === 'settings' ? (
      <SettingsView
        glassInfo={glassInfo}
        onCancel={() => {
          // Put the native window back to the saved look before leaving.
          if (previewAppearance) {
            void desktopApi.previewAppearance(snapshot.settings.appearance)
          }
          endAppearancePreview()
          void syncSnapshot(desktopApi.setView('panel'))
        }}
        onPreviewAppearance={setPreviewAppearance}
        onClearAllHistory={() => void handleClearAllHistory()}
        onPickStoragePath={(currentPath: string) => desktopApi.pickStoragePath(currentPath)}
        onRestoreDefaults={() => desktopApi.defaultShortcuts()}
        onSave={(settings: SettingsState) => {
          endAppearancePreview()
          void syncSnapshot(desktopApi.saveSettings(settings, snapshot.isRecordingPaused))
        }}
        settings={snapshot.settings}
      />
    ) : (
      <QuickPanelView
        isAlwaysOnTop={snapshot.isAlwaysOnTop}
        shortcuts={snapshot.settings.shortcuts}
        isRecordingPaused={snapshot.isRecordingPaused}
        onClearHistory={handleClearHistory}
        onCopy={handleCopyRecord}
        onSaveImage={handleSaveImage}
        onDelete={handleDeleteRecord}
        onHideWindow={handleHideWindow}
        onOpenSettings={handleOpenSettings}
        onPastePlainText={handlePastePlainText}
        onPrimaryAction={handlePrimaryAction}
        onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
        onTogglePause={handleTogglePause}
        onTogglePin={handleTogglePin}
        pinnedRecords={snapshot.pinnedRecords}
        recentRecords={snapshot.recentRecords}
      />
    )

  return (
    <I18nContext.Provider value={t}>
    <MotionConfig reducedMotion={appearance.animations ? 'user' : 'always'}>
      <LiquidGlassContext.Provider value={liquidSettings}>
      {/* A press on the transparent shadow margin around the panel counts as clicking away. */}
      <main
        className="app-shell"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && document.documentElement.classList.contains('is-desktop')) {
            void desktopApi.hideWindow()
          }
        }}
      >
        <div className="glass-window" data-view={snapshot.view}>
          <div aria-hidden="true" className="glass-backdrop" />
          {/* transitionEnd drops the filter afterwards: a lingering filter would keep the whole
              view on its own render surface and isolate it from backdrop-filter glass. */}
          <motion.div
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }}
            className="view-frame"
            initial={VIEW_ENTER[snapshot.view]}
            key={snapshot.view}
            transition={VIEW_TRANSITION}
          >
            {frame}
          </motion.div>
          <ToastHost onAction={handleToastAction} onDismiss={handleDismissToast} toast={snapshot.toast} />
        </div>
        <div aria-hidden="true" className="window-resize-edge" data-edge="top" />
        <div aria-hidden="true" className="window-resize-edge" data-edge="bottom" />
      </main>
      </LiquidGlassContext.Provider>
    </MotionConfig>
    </I18nContext.Provider>
  )
}

export default App
