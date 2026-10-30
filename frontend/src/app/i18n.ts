import { createContext, useContext } from 'react'
import type { HistoryRecord, Language, ToastMessage } from './types'

const en = {
  loading: 'Starting ClipDeck…',
  panel: {
    filters: { all: 'All', text: 'Text', image: 'Images', file: 'Files' },
    filterByType: 'Filter by type',
    alwaysOnTop: 'Always on top',
    enableOnTop: 'Keep on top',
    disableOnTop: 'Stop keeping on top',
    search: 'Search',
    searchTitle: 'Search (or just start typing)',
    searchHistory: 'Search clipboard history',
    searchPlaceholder: 'Search clips',
    clearSearch: 'Clear search',
    pauseRecording: 'Pause recording',
    resumeRecording: 'Resume recording',
    settings: 'Settings',
    hide: 'Hide window',
    hideTitle: 'Hide (Esc)',
    pinned: 'Pinned',
    recent: 'Recent',
    clear: 'Clear',
    clearTitle: 'Clear recent clips',
    noMatch: 'No matching clips',
    empty: 'No clips yet. Copy something to get started.',
  },
  card: {
    from: (summary: string, source: string) => `${summary} from ${source}`,
    saveImage: 'Save image',
    copy: 'Copy',
    pastePlain: 'Paste as plain text',
    pin: 'Pin',
    unpin: 'Unpin',
    delete: 'Delete',
    unknownSource: 'Clipboard',
    richTextOnly: 'Formatted content',
    image: (width: number, height: number) => `Image ${width} × ${height}`,
    moreFiles: (name: string, more: number) => `${name} and ${more} more`,
  },
  time: {
    justNow: 'just now',
    minutes: (n: number) => `${n}m ago`,
    hours: (n: number) => `${n}h ago`,
    yesterday: 'Yesterday',
    days: (n: number) => `${n}d ago`,
    locale: 'en-US',
  },
  toast: {
    dismiss: 'Dismiss',
    undo: 'Undo',
    recording_paused: ['Recording paused', 'New clipboard content stays out of the history.'],
    recording_resumed: ['Recording resumed', 'New clipboard content goes into the history again.'],
    pinned: ['Pinned', ''],
    unpinned: ['Unpinned', ''],
    deleted: ['Clip deleted', ''],
    restored: ['Clip restored', ''],
    restored_many: ['Clips restored', (n: number) => `${n} clips are back.`],
    cleared_all: ['History cleared', 'Pinned and recent clips were removed.'],
    cleared_unpinned: ['Recent clips cleared', (n: number) => `${n} clips removed; pinned clips stay.`],
    image_missing: ['Could not save image', 'The file for this image no longer exists.'],
    image_save_failed: ['Could not save image', (folder: string) => `Cannot write to ${folder}. Pick another folder in Settings.`],
    image_saved: ['Image saved', (path: string) => path],
    storage_unavailable: ['Storage folder unavailable', (path: string) => `${path} cannot be reached; using the default folder.`],
    storage_unwritable: ['Storage folder unavailable', (path: string) => `${path} cannot be written; other settings were saved.`],
    settings_saved: ['Settings saved', 'Your changes are in effect.'],
    clipboard_busy: ['Clipboard busy', 'Another app is using the clipboard. Try again.'],
    hotkey_failed: ['Shortcut unavailable', (shortcut: string) => `${shortcut} is taken by another app. Choose another one in Settings.`],
  },
  settings: {
    title: 'Settings',
    subtitle: 'Behaviour, look, shortcuts and storage',
    back: 'Back',
    cancel: 'Cancel',
    save: 'Save',
    categories: {
      general: ['General', 'Startup and language'],
      capture: ['Capture', 'What gets recorded'],
      shortcuts: ['Shortcuts', 'Opening the panel and keys inside it'],
      history: ['History & Storage', 'How many clips, and where they are kept'],
      glass: ['Window Glass', 'Corners, tint, blur and text'],
      liquid: ['Liquid Glass', 'Refraction on the controls'],
    },
    launchOnStartup: ['Launch on Startup', 'Start ClipDeck after you sign in to Windows'],
    language: ['Language', 'Language of the whole app'],
    recordText: ['Record Text', 'Keep plain text copied from apps'],
    recordRichText: ['Record Rich Text', 'Keep formatting when the app provides it'],
    recordImages: ['Record Images', 'Keep copied screenshots and pictures'],
    recordFiles: ['Record Files', 'Keep copied files and groups of files'],
    shortcuts: {
      togglePanel: 'Open Panel',
      primaryAction: 'Paste',
      pastePlainText: 'Paste as Plain Text',
      togglePin: 'Pin / Unpin',
      deleteRecord: 'Delete Clip',
      restore: 'Restore Defaults',
    },
    historyLimit: ['History Limit', 'Most unpinned clips to keep; pinned clips always stay'],
    increaseLimit: 'Increase history limit',
    decreaseLimit: 'Decrease history limit',
    storagePath: ['Storage Folder', 'Where the history and its images are kept'],
    imageSavePath: ['Image Save Folder', 'Where the save button on image clips puts the picture'],
    browse: 'Browse',
    browseImageFolder: 'Browse image save folder',
    dataHeading: 'Data',
    clearAll: ['Clear All History', 'Remove every pinned and recent clip'],
    clearAllButton: 'Clear All History',
    confirmClearAll: 'Clear all clipboard history? Pinned and recent clips will be removed.',
  },
  appearance: {
    windowHeading: 'Window',
    glassHeading: 'Glass',
    edgesHeading: 'Edges & Text',
    cornerRadius: ['Corner Radius', 'Roundness of the panel corners'],
    animations: ['Animations', 'Springs, the reveal and elastic glass'],
    glassTemplate: 'Glass Template',
    custom: 'Custom',
    customHint: 'Custom: your own values, edited below',
    glassSource: 'Glass Source',
    sourceLive: 'Live',
    sourceSnapshot: 'Snapshot',
    sourceHintFiltered: 'The desktop behind the panel, blurred and filtered in real time',
    sourceHintFixed: "Windows' own live blur (fixed strength); this system cannot capture behind the panel",
    sourceHintSnapshot: 'A frosted snapshot taken when the panel opens; liquid edges bend it',
    sourceHintUnavailable: 'Live blur needs the native helper (desktop app only); using snapshots',
    whites: ['Whites', 'How bright white on the desktop looks through the glass; lower is darker glass'],
    blacks: ['Blacks', 'How bright black on the desktop looks through the glass; higher is more haze'],
    blur: 'Backdrop Blur',
    blurFixed: "0 shows the desktop sharp; Windows' blur fades in and is full from 12 px",
    blurFiltered: 'Gaussian blur radius; 0 is perfectly clear',
    blurSnapshot: 'Frost of the desktop snapshot; 0 shows it sharp',
    saturation: 'Backdrop Saturation',
    saturationFixed: 'Set by Windows in live mode',
    saturationHint: 'Colour strength of the backdrop',
    rimLight: ['Rim Light', 'Light catching the top-left and bottom-right corners'],
    edgeHighlight: ['Edge Highlight', 'Top sheen, top light line and a brighter outline'],
    text: 'Text',
    textAuto: (tone: 'light' | 'dark') => `Auto picks ${tone === 'light' ? 'white' : 'black'} text for this glass`,
    textHint: 'Colour of text and controls',
    textOptions: { auto: 'Auto', light: 'White', dark: 'Black' },
    textHalo: ['Text Halo', 'Soft glow behind text over bright or busy windows'],
    secondaryText: ['Secondary Text', 'Opacity of times, sources and hints'],
    reset: 'Reset Appearance',
    previewHint: 'Preview · hover the glass to feel the magnet',
    previewRows: [
      ['Quarterly report draft', 'Word · 2m ago'],
      ['git push -u origin main', 'Terminal · 5m ago'],
      ['Meeting moved to 3:30 PM', 'Mail · 12m ago'],
      ['https://example.com/design', 'Chrome · 20m ago'],
      ['Notes for the next release', 'Notes · 1h ago'],
    ],
    liquidEffect: ['Liquid Effect', 'Refracting edges on the search bar, filters and toasts'],
    liquidTemplate: 'Liquid Template',
    refraction: ['Refraction Mode', 'Shape of the bend at the edges'],
    modes: { standard: 'Standard', polar: 'Polar', prominent: 'Prominent', shader: 'Shader' },
    displacement: ['Displacement', 'Strength of the edge refraction'],
    aberration: 'Chromatic Aberration',
    aberrationLive: 'Needs Snapshot glass: over live glass the colour split turns grey, so it is off',
    aberrationHint: 'Colour fringing along the bent edge',
    elasticity: ['Elasticity', 'How far a hovered capsule follows the pointer'],
    frost: ['Frost', 'Blur inside the liquid controls'],
    liquidSaturation: ['Glass Saturation', 'Colour strength seen through the controls'],
    shade: ['Shade', 'Darkens the controls; calmer glass over bright content'],
    presets: {
      smoke: ['Dark Glass', 'Neutral grey glass that dims the desktop under white text'],
      'clear-light': ['Light Glass', 'Thin white wash with black text, like light-mode Windows'],
      subtle: ['Subtle', 'A faint bend at the very edge'],
      standard: ['Standard', 'The liquid-glass-react defaults'],
      strong: ['Strong', 'Wide lens edge and a springy pull'],
      calm: ['Calm', 'Darker, frostier glass for bright backgrounds'],
    } as Record<string, readonly [string, string]>,
  },
}

export type Strings = typeof en

const zh: Strings = {
  loading: '正在启动 ClipDeck…',
  panel: {
    filters: { all: '全部', text: '文本', image: '图片', file: '文件' },
    filterByType: '按类型筛选',
    alwaysOnTop: '窗口置顶',
    enableOnTop: '置顶窗口',
    disableOnTop: '取消置顶',
    search: '搜索',
    searchTitle: '搜索（也可以直接打字）',
    searchHistory: '搜索剪贴板历史',
    searchPlaceholder: '搜索记录',
    clearSearch: '清除搜索',
    pauseRecording: '暂停记录',
    resumeRecording: '继续记录',
    settings: '设置',
    hide: '隐藏窗口',
    hideTitle: '隐藏 (Esc)',
    pinned: '已固定',
    recent: '最近',
    clear: '清除',
    clearTitle: '清除最近记录',
    noMatch: '没有匹配的记录',
    empty: '还没有记录，复制点什么试试。',
  },
  card: {
    from: (summary, source) => `${summary}，来自 ${source}`,
    saveImage: '保存图片',
    copy: '复制',
    pastePlain: '纯文本粘贴',
    pin: '固定',
    unpin: '取消固定',
    delete: '删除',
    unknownSource: '剪贴板',
    richTextOnly: '带格式的内容',
    image: (width, height) => `图片 ${width} × ${height}`,
    moreFiles: (name, more) => `${name} 等 ${more + 1} 个文件`,
  },
  time: {
    justNow: '刚刚',
    minutes: (n) => `${n} 分钟前`,
    hours: (n) => `${n} 小时前`,
    yesterday: '昨天',
    days: (n) => `${n} 天前`,
    locale: 'zh-CN',
  },
  toast: {
    dismiss: '关闭',
    undo: '撤销',
    recording_paused: ['记录已暂停', '新的剪贴板内容暂时不会进入历史。'],
    recording_resumed: ['已恢复记录', '新的剪贴板内容会继续进入历史。'],
    pinned: ['已固定', ''],
    unpinned: ['已取消固定', ''],
    deleted: ['记录已删除', ''],
    restored: ['已恢复删除的记录', ''],
    restored_many: ['已恢复记录', (n) => `${n} 条记录已恢复。`],
    cleared_all: ['已清空全部历史', '固定和最近记录都已移除。'],
    cleared_unpinned: ['已清除最近记录', (n) => `移除了 ${n} 条，固定记录都还在。`],
    image_missing: ['图片保存失败', '这张图片的文件已不存在。'],
    image_save_failed: ['图片保存失败', (folder) => `无法写入 ${folder}，可在设置里换一个保存位置。`],
    image_saved: ['图片已保存', (path) => path],
    storage_unavailable: ['存储位置不可用', (path) => `${path} 无法访问，已改用默认位置。`],
    storage_unwritable: ['存储位置不可用', (path) => `${path} 无法写入，其余设置已保存。`],
    settings_saved: ['设置已保存', '新的设置已经生效。'],
    clipboard_busy: ['剪贴板被占用', '另一个程序正在使用剪贴板，请再试一次。'],
    hotkey_failed: ['快捷键不可用', (shortcut) => `${shortcut} 已被其他程序占用，请在设置里换一个。`],
  },
  settings: {
    title: '设置',
    subtitle: '行为、外观、快捷键和存储',
    back: '返回',
    cancel: '取消',
    save: '保存',
    categories: {
      general: ['通用', '开机启动和语言'],
      capture: ['记录', '记录哪些内容'],
      shortcuts: ['快捷键', '唤出面板，以及面板里的按键'],
      history: ['历史与存储', '保留多少条，存在哪里'],
      glass: ['窗口玻璃', '圆角、颜色、模糊和文字'],
      liquid: ['液态玻璃', '控件上的折射效果'],
    },
    launchOnStartup: ['开机启动', '登录 Windows 后自动运行 ClipDeck'],
    language: ['语言', '整个应用的显示语言'],
    recordText: ['记录文本', '保存从应用里复制的纯文本'],
    recordRichText: ['记录富文本', '应用提供格式时，连格式一起保存'],
    recordImages: ['记录图片', '保存复制的截图和图片'],
    recordFiles: ['记录文件', '保存复制的文件和文件组'],
    shortcuts: {
      togglePanel: '唤出面板',
      primaryAction: '粘贴',
      pastePlainText: '纯文本粘贴',
      togglePin: '固定 / 取消固定',
      deleteRecord: '删除记录',
      restore: '恢复默认',
    },
    historyLimit: ['历史上限', '最多保留多少条未固定记录，固定的始终保留'],
    increaseLimit: '增加历史上限',
    decreaseLimit: '减少历史上限',
    storagePath: ['存储位置', '历史记录和图片保存在哪里'],
    imageSavePath: ['图片保存位置', '图片记录上的“保存”按钮存到哪里'],
    browse: '浏览',
    browseImageFolder: '选择图片保存位置',
    dataHeading: '数据',
    clearAll: ['清空全部历史', '删除所有固定和最近记录'],
    clearAllButton: '清空全部历史',
    confirmClearAll: '确定要清空全部历史记录吗？固定和最近记录都会被删除。',
  },
  appearance: {
    windowHeading: '窗口',
    glassHeading: '玻璃',
    edgesHeading: '边缘与文字',
    cornerRadius: ['圆角', '面板四角的圆润程度'],
    animations: ['动画', '弹簧、出现动画和弹性玻璃'],
    glassTemplate: '玻璃模板',
    custom: '自定义',
    customHint: '自定义：下面是你自己调的数值',
    glassSource: '玻璃来源',
    sourceLive: '实时',
    sourceSnapshot: '快照',
    sourceHintFiltered: '实时模糊面板后面的桌面',
    sourceHintFixed: 'Windows 自带的实时模糊（强度固定）；这台电脑无法截取面板后面的画面',
    sourceHintSnapshot: '打开面板时拍一张桌面快照并磨砂，液态边缘会折射它',
    sourceHintUnavailable: '实时模糊需要原生组件（仅桌面版）；现在使用快照',
    whites: ['白场', '桌面上的白色透过玻璃有多亮；越低玻璃越暗'],
    blacks: ['黑场', '桌面上的黑色透过玻璃有多亮；越高雾感越重'],
    blur: '背景模糊',
    blurFixed: '0 时桌面清晰；Windows 的模糊会渐入，12 px 起为全强度',
    blurFiltered: '高斯模糊半径；0 为完全清晰',
    blurSnapshot: '桌面快照的磨砂程度；0 为清晰',
    saturation: '背景饱和度',
    saturationFixed: '实时模式下由 Windows 决定',
    saturationHint: '背景颜色的浓淡',
    rimLight: ['边缘光', '左上角和右下角反射的光'],
    edgeHighlight: ['顶部高光', '顶部光泽、顶边亮线和更亮的轮廓'],
    text: '文字',
    textAuto: (tone) => `自动：这块玻璃上使用${tone === 'light' ? '白色' : '黑色'}文字`,
    textHint: '文字和控件的颜色',
    textOptions: { auto: '自动', light: '白色', dark: '黑色' },
    textHalo: ['文字光晕', '在明亮或杂乱的窗口上，文字后面加一层柔光'],
    secondaryText: ['次要文字', '时间、来源和提示文字的不透明度'],
    reset: '恢复默认外观',
    previewHint: '预览 · 把鼠标放到玻璃上，感受磁吸',
    previewRows: [
      ['季度报告草稿', 'Word · 2 分钟前'],
      ['git push -u origin main', '终端 · 5 分钟前'],
      ['会议改到下午 3:30', '邮件 · 12 分钟前'],
      ['https://example.com/design', 'Chrome · 20 分钟前'],
      ['下个版本的备忘', '便笺 · 1 小时前'],
    ],
    liquidEffect: ['液态效果', '搜索栏、筛选和提示上的折射边缘'],
    liquidTemplate: '液态模板',
    refraction: ['折射方式', '边缘弯折的形状'],
    modes: { standard: '标准', polar: '环形', prominent: '强烈', shader: '着色器' },
    displacement: ['折射强度', '边缘折射的力度'],
    aberration: '色散',
    aberrationLive: '需要快照玻璃：在实时玻璃上色散会变灰，所以关闭',
    aberrationHint: '弯折边缘上的彩色镶边',
    elasticity: ['弹性', '鼠标悬停时胶囊跟随指针的距离'],
    frost: ['磨砂', '液态控件内部的模糊'],
    liquidSaturation: ['玻璃饱和度', '透过控件看到的颜色浓淡'],
    shade: ['暗度', '让控件变暗；在明亮内容上更沉稳'],
    presets: {
      smoke: ['深色玻璃', '中性灰玻璃，压暗桌面，配白色文字'],
      'clear-light': ['浅色玻璃', '一层薄薄的白，配黑色文字，像浅色模式的 Windows'],
      subtle: ['轻微', '只在最边缘轻轻弯折'],
      standard: ['标准', 'liquid-glass-react 的默认值'],
      strong: ['强烈', '更宽的透镜边缘和更弹的跟随'],
      calm: ['沉稳', '更暗、更磨砂，适合明亮背景'],
    },
  },
}

export const STRINGS: Record<Language, Strings> = { en, zh }

export const I18nContext = createContext<Strings>(en)

export function useT() {
  return useContext(I18nContext)
}

export function stringsFor(language: Language | undefined): Strings {
  return STRINGS[language === 'zh' ? 'zh' : 'en']
}

/** What a clip is called in the list. Image and file clips are named from their data, so they
 * follow the app's language; text is what was copied. */
export function recordTitle(record: HistoryRecord, t: Strings) {
  if (record.type === 'image' && record.imageWidth && record.imageHeight) {
    return t.card.image(record.imageWidth, record.imageHeight)
  }
  if (record.type === 'file' && record.filePaths.length) {
    const name = record.filePaths[0].split(/[\\/]/).pop() || record.filePaths[0]
    return record.filePaths.length > 1 ? t.card.moreFiles(name, record.filePaths.length - 1) : name
  }
  if (record.type === 'rich_text' && record.summary === RICH_TEXT_PLACEHOLDER) {
    return t.card.richTextOnly
  }
  return record.summary
}

/** Matches RICH_TEXT_PLACEHOLDER in backend/app/clipboard.py: rich text with no text in it. */
export const RICH_TEXT_PLACEHOLDER = 'Rich text'

export function sourceName(record: HistoryRecord, t: Strings) {
  return record.sourceApp === 'Clipboard' ? t.card.unknownSource : record.sourceApp
}

type ToastEntry = readonly [string, string | ((value: never) => string)]

/** A toast's text, from the kind and values the backend sent. */
export function toastText(toast: ToastMessage, t: Strings) {
  const entry = (t.toast as unknown as Record<string, ToastEntry | undefined>)[toast.kind]
  const params = toast.params ?? {}
  const summary = params.summary === RICH_TEXT_PLACEHOLDER ? t.card.richTextOnly : params.summary
  if (!entry) {
    return { title: toast.kind, message: summary ?? '' }
  }
  const [title, body] = entry
  const value = params.count ?? params.path ?? params.folder ?? params.shortcut ?? ''
  const message = typeof body === 'function' ? (body as (value: string | number) => string)(value) : body || summary || ''
  return { title, message }
}
