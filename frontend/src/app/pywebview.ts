import { DEFAULT_APPEARANCE, normalizeAppearance } from './appearance'
import { stringsFor } from './i18n'
import type {
  AppearanceSettings,
  AppSnapshot,
  AppView,
  HistoryRecord,
  SettingsState,
  ShortcutBindings,
  ToastMessage,
} from './types'

type WindowApi = {
  get_app_state: () => Promise<AppSnapshot>
  set_view: (view: AppView) => Promise<AppSnapshot>
  toggle_pause: () => Promise<AppSnapshot>
  toggle_always_on_top: () => Promise<AppSnapshot>
  toggle_pin: (recordId: string) => Promise<AppSnapshot>
  delete_record: (recordId: string) => Promise<AppSnapshot>
  undo_delete: () => Promise<AppSnapshot>
  clear_all_history: () => Promise<AppSnapshot>
  clear_unpinned_history: () => Promise<AppSnapshot>
  copy_record: (recordId: string) => Promise<AppSnapshot>
  save_image: (recordId: string) => Promise<AppSnapshot>
  trigger_primary_action: (recordId: string) => Promise<AppSnapshot>
  paste_plain_text: (recordId: string) => Promise<AppSnapshot>
  save_settings: (settings: SettingsState, pauseRecording: boolean) => Promise<AppSnapshot>
  default_shortcuts: () => Promise<ShortcutBindings>
  dismiss_toast: () => Promise<AppSnapshot>
  hide_window: () => Promise<void>
  pick_storage_path: (currentPath: string) => Promise<string | null>
  confirm_clear_all_history: () => Promise<boolean>
  preview_appearance: (appearance: AppearanceSettings) => Promise<void>
  begin_window_drag: (grabX: number, grabY: number) => Promise<void>
  begin_window_resize?: (edge: 'top' | 'bottom', grabY: number) => Promise<void>
  page_ready?: () => Promise<void>
}

type SnapshotListener = (snapshot: AppSnapshot) => void

// What the toast's undo brings back: the clip just deleted, or the recent clips just cleared.
let deletedRecords: HistoryRecord[] = []

const defaultSettings: SettingsState = {
  language: typeof navigator !== 'undefined' && navigator.language.startsWith('zh') ? 'zh' : 'en',
  launchOnStartup: true,
  closeToTray: true,
  followSystemTheme: true,
  recordText: true,
  recordRichText: true,
  historyLimit: 25,
  recordImages: true,
  recordFiles: true,
  storagePath: '%LOCALAPPDATA%\\ClipDeck\\data',
  imageSavePath: '%USERPROFILE%\\Desktop',
  shortcuts: {
    togglePanel: 'Alt + Space',
    primaryAction: 'Enter',
    pastePlainText: 'Ctrl + Shift + V',
    togglePin: 'Ctrl + P',
    deleteRecord: 'Delete',
  },
  appearance: DEFAULT_APPEARANCE,
}

function normalizeSettings(settings: Partial<SettingsState>): SettingsState {
  return {
    ...structuredClone(defaultSettings),
    ...settings,
    language: settings.language === 'zh' ? 'zh' : settings.language === 'en' ? 'en' : defaultSettings.language,
    historyLimit: normalizeHistoryLimit(settings.historyLimit),
    shortcuts: {
      ...structuredClone(defaultSettings.shortcuts),
      ...(settings.shortcuts ?? {}),
    },
    appearance: normalizeAppearance(settings.appearance),
  }
}

function normalizeHistoryLimit(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return defaultSettings.historyLimit
  }

  return Math.min(5000, Math.max(1, Math.trunc(value)))
}

function createMockRecords(): HistoryRecord[] {
  return [
    {
      id: 'text-1',
      type: 'text',
      summary: 'Build review notes for the quick panel and tray wiring.',
      detail: 'Build review notes for the quick panel and tray wiring.',
      sourceApp: 'Microsoft OneNote',
      sourceGlyph: 'ON',
      sourceIcon: './demo-icons/onenote.png',
      pinned: true,
      createdAt: '2026-03-11T10:14:00',
      updatedAt: '2026-03-11T10:14:00',
      imagePath: null,
      imageWidth: null,
      imageHeight: null,
      filePaths: [],
    },
    {
      id: 'image-1',
      type: 'image',
      summary: 'Screenshot capture with 1440 × 900 preview ready to paste.',
      detail: 'Screenshot capture with 1440 × 900 preview ready to paste.',
      sourceApp: 'PixPin',
      sourceGlyph: 'PP',
      sourceIcon: './demo-icons/pixpin.png',
      pinned: true,
      createdAt: '2026-03-11T10:03:00',
      updatedAt: '2026-03-11T10:03:00',
      imagePath: 'https://picsum.photos/seed/cipher1/64/64',
      imageWidth: 1440,
      imageHeight: 900,
      filePaths: [],
    },
    {
      id: 'rich-1',
      type: 'rich_text',
      summary: 'Meeting summary with bullet formatting for the V1 launch checklist.',
      detail: 'Meeting summary with bullet formatting for the V1 launch checklist.',
      sourceApp: 'Microsoft Edge',
      sourceGlyph: 'ED',
      sourceIcon: './demo-icons/edge.png',
      pinned: false,
      createdAt: '2026-03-11T09:51:00',
      updatedAt: '2026-03-11T09:51:00',
      imagePath: null,
      imageWidth: null,
      imageHeight: null,
      filePaths: [],
    },
    {
      id: 'file-1',
      type: 'file',
      summary: 'wireframe.png and 3 more files from the design handoff folder.',
      detail: 'wireframe.png and 3 more files from the design handoff folder.',
      sourceApp: 'File Explorer',
      sourceGlyph: 'FE',
      sourceIcon: './demo-icons/explorer.png',
      pinned: false,
      createdAt: '2026-03-11T09:32:00',
      updatedAt: '2026-03-11T09:32:00',
      imagePath: null,
      imageWidth: null,
      imageHeight: null,
      filePaths: [
        'mock-handoff\\wireframe.png',
        'mock-handoff\\handoff-notes.docx',
        'mock-handoff\\tokens.json',
        'mock-handoff\\review.png',
      ],
    },
    {
      id: 'text-2',
      type: 'text',
      summary: 'npm run test:run',
      detail: 'npm run test:run',
      sourceApp: 'Visual Studio Code',
      sourceGlyph: 'VS',
      sourceIcon: './demo-icons/vscode.png',
      pinned: false,
      createdAt: '2026-03-11T09:12:00',
      updatedAt: '2026-03-11T09:12:00',
      imagePath: null,
      imageWidth: null,
      imageHeight: null,
      filePaths: [],
    },
    {
      id: 'text-3',
      type: 'text',
      summary: 'ssh deploy@staging-box',
      detail: 'ssh deploy@staging-box',
      sourceApp: 'Windows Terminal',
      sourceGlyph: 'WT',
      sourceIcon: './demo-icons/terminal.png',
      pinned: false,
      createdAt: '2026-03-11T08:58:00',
      updatedAt: '2026-03-11T08:58:00',
      imagePath: null,
      imageWidth: null,
      imageHeight: null,
      filePaths: [],
    },
    {
      id: 'rich-2',
      type: 'rich_text',
      summary: 'Sprint recap: finish tray wiring, validate pywebview bridge, update README.',
      detail: 'Sprint recap: finish tray wiring, validate pywebview bridge, update README.',
      sourceApp: 'ChatGPT',
      sourceGlyph: 'AI',
      sourceIcon: './demo-icons/chatgpt.png',
      pinned: false,
      createdAt: '2026-03-11T08:43:00',
      updatedAt: '2026-03-11T08:43:00',
      imagePath: null,
      imageWidth: null,
      imageHeight: null,
      filePaths: [],
    },
    {
      id: 'file-2',
      type: 'file',
      summary: 'release-notes.docx from mock-handoff',
      detail: 'release-notes.docx from mock-handoff',
      sourceApp: 'File Explorer',
      sourceGlyph: 'FE',
      sourceIcon: './demo-icons/explorer.png',
      pinned: false,
      createdAt: '2026-03-11T08:26:00',
      updatedAt: '2026-03-11T08:26:00',
      imagePath: null,
      imageWidth: null,
      imageHeight: null,
      filePaths: ['mock-handoff\\release-notes.docx'],
    },
    {
      id: 'image-2',
      type: 'image',
      summary: 'Component snapshot with 1280 × 720 preview for settings page review.',
      detail: 'Component snapshot with 1280 × 720 preview for settings page review.',
      sourceApp: 'Google Chrome',
      sourceGlyph: 'GC',
      sourceIcon: './demo-icons/chrome.png',
      pinned: false,
      createdAt: '2026-03-11T08:10:00',
      updatedAt: '2026-03-11T08:10:00',
      imagePath: 'https://picsum.photos/seed/cipher2/64/64',
      imageWidth: 1280,
      imageHeight: 720,
      filePaths: [],
    },
    {
      id: 'text-4',
      type: 'text',
      summary: 'docker compose up -d --build',
      detail: 'docker compose up -d --build',
      sourceApp: 'Docker Desktop',
      sourceGlyph: 'DD',
      sourceIcon: './demo-icons/docker.png',
      pinned: false,
      createdAt: '2026-03-11T07:54:00',
      updatedAt: '2026-03-11T07:54:00',
      imagePath: null,
      imageWidth: null,
      imageHeight: null,
      filePaths: [],
    },
    {
      id: 'text-5',
      type: 'text',
      summary: 'Color token note: use warm paper background with rust accent and slate text.',
      detail: 'Color token note: use warm paper background with rust accent and slate text.',
      sourceApp: 'WeChat',
      sourceGlyph: 'WC',
      sourceIcon: './demo-icons/wechat.png',
      pinned: true,
      createdAt: '2026-03-11T07:40:00',
      updatedAt: '2026-03-11T07:40:00',
      imagePath: null,
      imageWidth: null,
      imageHeight: null,
      filePaths: [],
    },
  ]
}

function createSnapshot(): AppSnapshot {
  const records = createMockRecords()

  return {
    view: 'panel',
    isRecordingPaused: false,
    isAlwaysOnTop: false,
    pinnedRecords: records.filter((record) => record.pinned),
    recentRecords: records.filter((record) => !record.pinned),
    settings: normalizeSettings(defaultSettings),
    toast: null,
  }
}

let fallbackSnapshot = createSnapshot()
const listeners = new Set<SnapshotListener>()

function cloneSnapshot(snapshot: AppSnapshot): AppSnapshot {
  return structuredClone(snapshot)
}

function emitSnapshot(snapshot: AppSnapshot) {
  const cloned = cloneSnapshot(snapshot)
  for (const listener of listeners) {
    listener(cloned)
  }
}

function nextToast(
  kind: string,
  tone: ToastMessage['tone'],
  params?: ToastMessage['params'],
  actionKind: ToastMessage['actionKind'] = null,
): ToastMessage {
  return { id: `${kind}-${Date.now()}`, kind, params, tone, actionKind }
}

function allRecords(snapshot: AppSnapshot) {
  return [...snapshot.pinnedRecords, ...snapshot.recentRecords]
}

function repartition(records: HistoryRecord[]) {
  const sorted = [...records].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  return {
    pinnedRecords: sorted.filter((record) => record.pinned),
    recentRecords: sorted.filter((record) => !record.pinned),
  }
}

function findRecord(snapshot: AppSnapshot, recordId: string) {
  return allRecords(snapshot).find((record) => record.id === recordId) ?? null
}

function applyFallbackMutation(mutator: (draft: AppSnapshot) => void) {
  const draft = cloneSnapshot(fallbackSnapshot)
  mutator(draft)
  fallbackSnapshot = draft
  emitSnapshot(fallbackSnapshot)
  return cloneSnapshot(fallbackSnapshot)
}

function fallbackApi(): WindowApi {
  return {
    async get_app_state() {
      return cloneSnapshot(fallbackSnapshot)
    },
    async set_view(view) {
      return applyFallbackMutation((draft) => {
        draft.view = view
      })
    },
    async toggle_pause() {
      return applyFallbackMutation((draft) => {
        draft.isRecordingPaused = !draft.isRecordingPaused
        draft.toast = draft.isRecordingPaused
          ? nextToast('recording_paused', 'danger')
          : nextToast('recording_resumed', 'success')
      })
    },
    async toggle_always_on_top() {
      return applyFallbackMutation((draft) => {
        draft.isAlwaysOnTop = !draft.isAlwaysOnTop
      })
    },
    async toggle_pin(recordId) {
      return applyFallbackMutation((draft) => {
        const record = findRecord(draft, recordId)
        if (!record) {
          return
        }

        record.pinned = !record.pinned
        record.updatedAt = new Date().toISOString()
        const groups = repartition(allRecords(draft))
        draft.pinnedRecords = groups.pinnedRecords
        draft.recentRecords = groups.recentRecords
        draft.toast = nextToast(record.pinned ? 'pinned' : 'unpinned', 'success', { summary: record.summary })
      })
    },
    async delete_record(recordId) {
      return applyFallbackMutation((draft) => {
        const record = findRecord(draft, recordId)
        if (!record) {
          return
        }

        deletedRecords = [structuredClone(record)]
        draft.pinnedRecords = draft.pinnedRecords.filter((item) => item.id !== recordId)
        draft.recentRecords = draft.recentRecords.filter((item) => item.id !== recordId)
        draft.toast = nextToast('deleted', 'danger', { summary: record.summary }, 'undo_delete')
      })
    },
    async undo_delete() {
      return applyFallbackMutation((draft) => {
        if (!deletedRecords.length) {
          return
        }

        const groups = repartition([...allRecords(draft), ...deletedRecords])
        draft.pinnedRecords = groups.pinnedRecords
        draft.recentRecords = groups.recentRecords
        draft.toast =
          deletedRecords.length === 1
            ? nextToast('restored', 'success', { summary: deletedRecords[0].summary })
            : nextToast('restored_many', 'success', { count: deletedRecords.length })
        deletedRecords = []
      })
    },
    async clear_all_history() {
      return applyFallbackMutation((draft) => {
        draft.pinnedRecords = []
        draft.recentRecords = []
        deletedRecords = []
        draft.toast = nextToast('cleared_all', 'danger')
      })
    },
    async clear_unpinned_history() {
      return applyFallbackMutation((draft) => {
        deletedRecords = draft.recentRecords
        draft.recentRecords = []
        draft.toast = nextToast('cleared_unpinned', 'danger', { count: deletedRecords.length }, 'undo_delete')
      })
    },
    async copy_record(recordId) {
      return applyFallbackMutation((draft) => {
        const record = findRecord(draft, recordId)
        if (!record) {
          return
        }
      })
    },
    async save_image(recordId) {
      return applyFallbackMutation((draft) => {
        const record = findRecord(draft, recordId)
        if (!record || record.type !== 'image') {
          return
        }

        draft.toast = nextToast('image_saved', 'success', {
          path: `${draft.settings.imageSavePath}\\ClipDeck ${record.createdAt.slice(0, 19).replace('T', ' ').replace(/:/g, '-')}.png`,
        })
      })
    },
    // The desktop app pastes and hides; the browser demo has nowhere to paste into.
    async trigger_primary_action() {
      return cloneSnapshot(fallbackSnapshot)
    },
    async paste_plain_text() {
      return cloneSnapshot(fallbackSnapshot)
    },
    async save_settings(settings, pauseRecording) {
      return applyFallbackMutation((draft) => {
        draft.settings = normalizeSettings(settings)
        draft.isRecordingPaused = pauseRecording
        draft.view = 'panel'
        draft.toast = nextToast('settings_saved', 'success')
      })
    },
    async default_shortcuts() {
      return structuredClone(defaultSettings.shortcuts)
    },
    async dismiss_toast() {
      return applyFallbackMutation((draft) => {
        draft.toast = null
        deletedRecords = []
      })
    },
    async hide_window() {
      return Promise.resolve()
    },
    async pick_storage_path(currentPath) {
      const basePath = currentPath.replace(/[\\/]?data$/, '').replace(/[\\/]$/, '')
      return `${basePath}\\selected-data`
    },
    async confirm_clear_all_history() {
      return window.confirm(stringsFor(fallbackSnapshot.settings.language).settings.confirmClearAll)
    },
    async preview_appearance() {
      return Promise.resolve()
    },
    async begin_window_drag() {
      return Promise.resolve()
    },
  }
}

function getWindowApi(): WindowApi {
  return window.pywebview?.api ?? fallbackApi()
}

export const desktopApi = {
  getAppState() {
    return getWindowApi().get_app_state()
  },
  setView(view: AppView) {
    return getWindowApi().set_view(view)
  },
  togglePause() {
    return getWindowApi().toggle_pause()
  },
  toggleAlwaysOnTop() {
    return getWindowApi().toggle_always_on_top()
  },
  togglePin(recordId: string) {
    return getWindowApi().toggle_pin(recordId)
  },
  deleteRecord(recordId: string) {
    return getWindowApi().delete_record(recordId)
  },
  undoDelete() {
    return getWindowApi().undo_delete()
  },
  clearAllHistory() {
    return getWindowApi().clear_all_history()
  },
  clearUnpinnedHistory() {
    return getWindowApi().clear_unpinned_history()
  },
  copyRecord(recordId: string) {
    return getWindowApi().copy_record(recordId)
  },
  saveImage(recordId: string) {
    return getWindowApi().save_image(recordId)
  },
  triggerPrimaryAction(recordId: string) {
    return getWindowApi().trigger_primary_action(recordId)
  },
  pastePlainText(recordId: string) {
    return getWindowApi().paste_plain_text(recordId)
  },
  saveSettings(settings: SettingsState, pauseRecording: boolean) {
    return getWindowApi().save_settings(settings, pauseRecording)
  },
  defaultShortcuts() {
    return getWindowApi().default_shortcuts()
  },
  dismissToast() {
    return getWindowApi().dismiss_toast()
  },
  hideWindow() {
    return getWindowApi().hide_window()
  },
  pickStoragePath(currentPath: string) {
    return getWindowApi().pick_storage_path(currentPath)
  },
  confirmClearAllHistory() {
    return getWindowApi().confirm_clear_all_history()
  },
  previewAppearance(appearance: AppearanceSettings) {
    return getWindowApi().preview_appearance(appearance)
  },
  beginWindowDrag(grabX: number, grabY: number) {
    return getWindowApi().begin_window_drag(grabX, grabY)
  },
  beginWindowResize(edge: 'top' | 'bottom', grabY: number) {
    return getWindowApi().begin_window_resize?.(edge, grabY) ?? Promise.resolve()
  },
  pageReady() {
    return getWindowApi().page_ready?.() ?? Promise.resolve()
  },
}

export function subscribeSnapshot(listener: SnapshotListener) {
  const onEvent = (event: Event) => {
    const customEvent = event as CustomEvent<AppSnapshot>
    listener(customEvent.detail)
  }

  listeners.add(listener)
  window.addEventListener('clipboard:snapshot', onEvent)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('clipboard:snapshot', onEvent)
  }
}

export function resetDesktopApiMock() {
  deletedRecords = []
  fallbackSnapshot = createSnapshot()
  listeners.clear()
}
