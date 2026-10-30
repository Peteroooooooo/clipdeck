import type { AppearanceSettings, LiquidMode, TextTone } from './types'

type GlassKey =
  | 'whitePoint'
  | 'blackPoint'
  | 'backdropBlur'
  | 'backdropSaturation'
  | 'rimLight'
  | 'edgeHighlight'
  | 'textTone'
  | 'textHalo'
  | 'secondaryTextOpacity'
type LiquidKey = 'liquidMode' | 'displacementScale' | 'aberrationIntensity' | 'elasticity' | 'frost' | 'liquidSaturation' | 'liquidShade'

export type GlassValues = Pick<AppearanceSettings, GlassKey>
export type LiquidValues = Pick<AppearanceSettings, LiquidKey>

export interface Preset<T> {
  id: string
  label: string
  description: string
  values: T
}

/**
 * Window glass templates: the two looks that really differ, dark and light. Each one fills in
 * every glass parameter; heavier frost or a halo for busy desktops is a slider away, not another
 * template. Keep in sync with SMOKE_GLASS / CLEAR_LIGHT_GLASS in backend/app/models.py.
 */
export const GLASS_PRESETS: Preset<GlassValues>[] = [
  {
    id: 'smoke',
    label: 'Dark Glass',
    description: 'Neutral grey glass that dims the desktop under white text',
    // From white_text_gray_glass_tuner.html: rgba(130,130,130,.10) over brightness(.66).
    values: {
      whitePoint: 164,
      blackPoint: 13,
      backdropBlur: 10,
      backdropSaturation: 100,
      rimLight: 0,
      edgeHighlight: 0,
      textTone: 'auto',
      textHalo: 0,
      secondaryTextOpacity: 56,
    },
  },
  {
    id: 'clear-light',
    label: 'Light Glass',
    description: 'Thin white wash with black text, like light-mode Windows',
    values: {
      whitePoint: 255,
      blackPoint: 82,
      backdropBlur: 16,
      backdropSaturation: 160,
      rimLight: 100,
      edgeHighlight: 0,
      textTone: 'auto',
      textHalo: 0,
      secondaryTextOpacity: 46,
    },
  },
]

/** Liquid glass templates for the search bar, filters and toasts. */
export const LIQUID_PRESETS: Preset<LiquidValues>[] = [
  {
    id: 'subtle',
    label: 'Subtle',
    description: 'A faint bend at the very edge',
    values: { liquidMode: 'standard', displacementScale: 30, aberrationIntensity: 1, elasticity: 0.08, frost: 0.15, liquidSaturation: 120, liquidShade: 0 },
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'liquid-glass-react defaults',
    values: { liquidMode: 'standard', displacementScale: 70, aberrationIntensity: 2, elasticity: 0.15, frost: 0.25, liquidSaturation: 140, liquidShade: 0 },
  },
  {
    id: 'strong',
    label: 'Strong',
    description: 'Wide lens edge and a springy pull',
    values: { liquidMode: 'prominent', displacementScale: 120, aberrationIntensity: 3, elasticity: 0.3, frost: 0.3, liquidSaturation: 170, liquidShade: 0 },
  },
  {
    id: 'calm',
    label: 'Calm',
    description: 'Darker, frostier glass for bright backgrounds',
    values: { liquidMode: 'standard', displacementScale: 35, aberrationIntensity: 2, elasticity: 0.15, frost: 0.5, liquidSaturation: 140, liquidShade: 20 },
  },
]

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  glassSource: 'live',
  cornerRadius: 24,
  ...GLASS_PRESETS[0].values,
  liquidEnabled: true,
  ...LIQUID_PRESETS[1].values,
  animations: true,
}

/** The preset whose every value matches, or null for a custom combination. */
export function matchingPreset<T extends object>(presets: Preset<T>[], appearance: AppearanceSettings) {
  return (
    presets.find((preset) =>
      Object.entries(preset.values).every(([key, value]) => appearance[key as keyof AppearanceSettings] === value),
    ) ?? null
  )
}

export const BACKDROP_BLUR_MAX = 20

const TONES: TextTone[] = ['auto', 'light', 'dark']
const LIQUID_MODES: LiquidMode[] = ['standard', 'polar', 'prominent', 'shader']

function clamp(value: unknown, low: number, high: number, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return fallback
  }
  return Math.min(high, Math.max(low, value))
}

/** The white point never comes closer to the black point than this, so the desktop always shows. */
export const MIN_POINT_GAP = 4

/** Same bounds as backend/app/models.py AppearanceSettings.from_dict, which also converts
 * settings saved by older versions before they reach the page. */
export function normalizeAppearance(value: Partial<AppearanceSettings> | undefined): AppearanceSettings {
  const source = value ?? {}
  const d = DEFAULT_APPEARANCE
  const whitePoint = Math.round(clamp(source.whitePoint, MIN_POINT_GAP, 255, d.whitePoint))
  const blackMax = whitePoint - MIN_POINT_GAP
  return {
    glassSource: source.glassSource === 'snapshot' ? 'snapshot' : source.glassSource === 'live' ? 'live' : d.glassSource,
    cornerRadius: Math.round(clamp(source.cornerRadius, 8, 40, d.cornerRadius)),
    whitePoint,
    blackPoint: Math.round(clamp(source.blackPoint, 0, blackMax, Math.min(d.blackPoint, blackMax))),
    backdropBlur: Math.round(clamp(source.backdropBlur, 0, BACKDROP_BLUR_MAX, d.backdropBlur)),
    backdropSaturation: Math.round(clamp(source.backdropSaturation, 50, 250, d.backdropSaturation)),
    rimLight: Math.round(clamp(source.rimLight, 0, 100, d.rimLight)),
    edgeHighlight: Math.round(clamp(source.edgeHighlight, 0, 100, d.edgeHighlight)),
    textTone: TONES.includes(source.textTone as TextTone) ? (source.textTone as TextTone) : d.textTone,
    textHalo: Math.round(clamp(source.textHalo, 0, 100, d.textHalo)),
    secondaryTextOpacity: Math.round(clamp(source.secondaryTextOpacity, 30, 100, d.secondaryTextOpacity)),
    liquidEnabled: typeof source.liquidEnabled === 'boolean' ? source.liquidEnabled : d.liquidEnabled,
    liquidMode: LIQUID_MODES.includes(source.liquidMode as LiquidMode) ? (source.liquidMode as LiquidMode) : d.liquidMode,
    displacementScale: Math.round(clamp(source.displacementScale, 0, 150, d.displacementScale)),
    aberrationIntensity: Math.round(clamp(source.aberrationIntensity, 0, 10, d.aberrationIntensity) * 10) / 10,
    elasticity: Math.round(clamp(source.elasticity, 0, 0.5, d.elasticity) * 100) / 100,
    frost: Math.round(clamp(source.frost, 0, 1, d.frost) * 100) / 100,
    liquidSaturation: Math.round(clamp(source.liquidSaturation, 50, 250, d.liquidSaturation)),
    liquidShade: Math.round(clamp(source.liquidShade, 0, 50, d.liquidShade)),
    animations: typeof source.animations === 'boolean' ? source.animations : d.animations,
  }
}

function relativeLuminance(channel: number) {
  const v = channel / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

/**
 * The one tint layer that maps desktop white to the white point and black to the black point:
 * desktop level x comes out at x·(1 - alpha) + gray·alpha.
 */
function glassTint(appearance: AppearanceSettings) {
  const alpha = 1 - (appearance.whitePoint - appearance.blackPoint) / 255
  return { gray: alpha > 0 ? appearance.blackPoint / alpha : 0, alpha }
}

/** Grey level the glass comes out at over a mid-grey desktop. */
export function estimatedGlassLevel(appearance: AppearanceSettings) {
  return appearance.blackPoint + (128 / 255) * (appearance.whitePoint - appearance.blackPoint)
}

/** White text on dark glass, black text on light glass: whichever contrasts more. */
export function resolveTextTone(appearance: AppearanceSettings): 'light' | 'dark' {
  if (appearance.textTone !== 'auto') {
    return appearance.textTone
  }
  const luminance = relativeLuminance(estimatedGlassLevel(appearance))
  const whiteContrast = 1.05 / (luminance + 0.05)
  const blackContrast = (luminance + 0.05) / 0.05
  return whiteContrast >= blackContrast ? 'light' : 'dark'
}

/**
 * Pushes the appearance onto <html>: the text tone (as data-theme, which the control tokens
 * key on), the glass CSS variables and the motion switch.
 */
export function applyAppearance(appearance: AppearanceSettings, root: HTMLElement = document.documentElement) {
  // data-theme names the glass: white text means dark glass.
  const whiteText = resolveTextTone(appearance) === 'light'
  root.dataset.theme = whiteText ? 'dark' : 'light'
  const set = (name: string, value: string) => root.style.setProperty(name, value)
  const tint = glassTint(appearance)
  set('--tint-gray', String(Number(tint.gray.toFixed(2))))
  set('--tint-alpha', String(Number(tint.alpha.toFixed(4))))
  set('--window-radius', `${appearance.cornerRadius}px`)
  set('--backdrop-blur', `${appearance.backdropBlur}px`)
  set('--backdrop-saturation', `${appearance.backdropSaturation}%`)
  set('--rim', String(appearance.rimLight / 100))
  set('--edge-highlight', String(appearance.edgeHighlight / 100))
  set('--text-secondary-alpha', String(appearance.secondaryTextOpacity / 100))
  const halo = appearance.textHalo / 100
  const glow = whiteText ? '0, 0, 0' : '255, 255, 255'
  set(
    '--text-halo',
    halo > 0 ? `0 0 2px rgba(${glow}, ${(0.6 * halo).toFixed(3)}), 0 0 8px rgba(${glow}, ${(0.45 * halo).toFixed(3)})` : 'none',
  )
  root.classList.toggle('no-motion', !appearance.animations)
}
