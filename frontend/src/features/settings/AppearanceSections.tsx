import { ArrowCounterClockwise } from '@phosphor-icons/react'
import {
  BACKDROP_BLUR_MAX,
  GLASS_PRESETS,
  LIQUID_PRESETS,
  MIN_POINT_GAP,
  matchingPreset,
  resolveTextTone,
  type Preset,
} from '../../app/appearance'
import { useT, type Strings } from '../../app/i18n'
import type { AppearanceSettings, GlassSource, LiquidMode, TextTone } from '../../app/types'
import { ChoiceRow, PresetRow, SliderRow, ToggleRow } from './controls'
import { LiquidPreview } from './LiquidPreview'

export interface GlassInfo {
  /** Mode the native window is actually using; null outside the desktop app. */
  mode: GlassSource | null
  liveAvailable: boolean
  /** Live glass with real, adjustable filters (otherwise Windows' fixed blur). */
  filtered?: boolean
}

interface AppearanceSectionsProps {
  appearance: AppearanceSettings
  glassInfo: GlassInfo
  onChange: (patch: Partial<AppearanceSettings>) => void
  onReset: () => void
}

const percent = (value: number) => `${Math.round(value)}%`
const pixels = (value: number) => `${Math.round(value)} px`
const decimal = (digits: number) => (value: number) => value.toFixed(digits)

/** Template names and descriptions in the app's language. */
function localized<T>(presets: Preset<T>[], t: Strings) {
  return presets.map((preset) => {
    const [label, description] = t.appearance.presets[preset.id] ?? [preset.label, preset.description]
    return { ...preset, label, description }
  })
}

function ResetButton({ onReset }: { onReset: () => void }) {
  const t = useT()
  return (
    <button className="ghost-button section-reset" onClick={onReset} type="button">
      <ArrowCounterClockwise size={14} weight="bold" />
      {t.appearance.reset}
    </button>
  )
}

/** The window itself: corners, motion, the glass and the text on it. */
export function GlassSections({ appearance, glassInfo, onChange, onReset }: AppearanceSectionsProps) {
  const t = useT()
  const a = t.appearance
  const live = appearance.glassSource === 'live'
  // Live glass without the filter pipeline is Windows' own blur, whose strength is fixed.
  const liveFixed = live && glassInfo.liveAvailable && !glassInfo.filtered
  const sourceHint = glassInfo.liveAvailable
    ? live
      ? glassInfo.filtered
        ? a.sourceHintFiltered
        : a.sourceHintFixed
      : a.sourceHintSnapshot
    : a.sourceHintUnavailable
  const autoTone = resolveTextTone({ ...appearance, textTone: 'auto' })

  return (
    <>
      <section aria-labelledby="appearance-heading" className="settings-section">
        <h2 id="appearance-heading">{a.windowHeading}</h2>
        <div className="settings-grid">
          <SliderRow
            description={a.cornerRadius[1]}
            format={pixels}
            label={a.cornerRadius[0]}
            max={40}
            min={8}
            onChange={(cornerRadius) => onChange({ cornerRadius })}
            value={appearance.cornerRadius}
          />
          <ToggleRow
            checked={appearance.animations}
            description={a.animations[1]}
            label={a.animations[0]}
            onClick={() => onChange({ animations: !appearance.animations })}
          />
        </div>
      </section>

      <section aria-labelledby="window-glass-heading" className="settings-section">
        <h2 id="window-glass-heading">{a.glassHeading}</h2>
        <div className="settings-grid">
          <PresetRow
            activeId={matchingPreset(GLASS_PRESETS, appearance)?.id ?? null}
            label={a.glassTemplate}
            onPick={(values) => onChange(values)}
            presets={localized(GLASS_PRESETS, t)}
          />
          <ChoiceRow<GlassSource>
            description={sourceHint}
            label={a.glassSource}
            onChange={(glassSource) => onChange({ glassSource })}
            options={[
              { value: 'live', label: a.sourceLive, disabled: !glassInfo.liveAvailable },
              { value: 'snapshot', label: a.sourceSnapshot },
            ]}
            value={glassInfo.liveAvailable ? appearance.glassSource : 'snapshot'}
          />
          <SliderRow
            description={a.whites[1]}
            label={a.whites[0]}
            max={255}
            min={MIN_POINT_GAP}
            onChange={(whitePoint) =>
              onChange({ whitePoint, blackPoint: Math.min(appearance.blackPoint, whitePoint - MIN_POINT_GAP) })
            }
            value={appearance.whitePoint}
          />
          <SliderRow
            description={a.blacks[1]}
            label={a.blacks[0]}
            max={255 - MIN_POINT_GAP}
            min={0}
            onChange={(blackPoint) =>
              onChange({ blackPoint, whitePoint: Math.max(appearance.whitePoint, blackPoint + MIN_POINT_GAP) })
            }
            value={appearance.blackPoint}
          />
          <SliderRow
            description={liveFixed ? a.blurFixed : live && glassInfo.filtered ? a.blurFiltered : a.blurSnapshot}
            format={pixels}
            label={a.blur}
            max={BACKDROP_BLUR_MAX}
            min={0}
            onChange={(backdropBlur) => onChange({ backdropBlur })}
            value={appearance.backdropBlur}
          />
          <SliderRow
            description={liveFixed ? a.saturationFixed : a.saturationHint}
            disabled={liveFixed}
            format={percent}
            label={a.saturation}
            max={250}
            min={50}
            onChange={(backdropSaturation) => onChange({ backdropSaturation })}
            value={appearance.backdropSaturation}
          />
        </div>
      </section>

      <section aria-labelledby="edges-text-heading" className="settings-section">
        <h2 id="edges-text-heading">{a.edgesHeading}</h2>
        <div className="settings-grid">
          <SliderRow
            description={a.rimLight[1]}
            format={percent}
            label={a.rimLight[0]}
            max={100}
            min={0}
            onChange={(rimLight) => onChange({ rimLight })}
            value={appearance.rimLight}
          />
          <SliderRow
            description={a.edgeHighlight[1]}
            format={percent}
            label={a.edgeHighlight[0]}
            max={100}
            min={0}
            onChange={(edgeHighlight) => onChange({ edgeHighlight })}
            value={appearance.edgeHighlight}
          />
          <ChoiceRow<TextTone>
            description={appearance.textTone === 'auto' ? a.textAuto(autoTone) : a.textHint}
            label={a.text}
            onChange={(textTone) => onChange({ textTone })}
            options={[
              { value: 'auto', label: a.textOptions.auto },
              { value: 'light', label: a.textOptions.light },
              { value: 'dark', label: a.textOptions.dark },
            ]}
            value={appearance.textTone}
          />
          <SliderRow
            description={a.textHalo[1]}
            format={percent}
            label={a.textHalo[0]}
            max={100}
            min={0}
            onChange={(textHalo) => onChange({ textHalo })}
            value={appearance.textHalo}
          />
          <SliderRow
            description={a.secondaryText[1]}
            format={percent}
            label={a.secondaryText[0]}
            max={100}
            min={30}
            onChange={(secondaryTextOpacity) => onChange({ secondaryTextOpacity })}
            value={appearance.secondaryTextOpacity}
          />
        </div>
        <ResetButton onReset={onReset} />
      </section>
    </>
  )
}

/** The liquid glass of the controls (search bar, filters, capsules, toasts). */
export function LiquidSections({ appearance, glassInfo, onChange, onReset }: AppearanceSectionsProps) {
  const t = useT()
  const a = t.appearance
  const liquid = appearance.liquidEnabled
  const modes: LiquidMode[] = ['standard', 'polar', 'prominent', 'shader']

  return (
    <section aria-label={t.settings.categories.liquid[0]} className="settings-section">
      <LiquidPreview />
      <div className="settings-grid">
        <ToggleRow
          checked={liquid}
          description={a.liquidEffect[1]}
          label={a.liquidEffect[0]}
          onClick={() => onChange({ liquidEnabled: !liquid })}
        />
        <PresetRow
          activeId={matchingPreset(LIQUID_PRESETS, appearance)?.id ?? null}
          disabled={!liquid}
          label={a.liquidTemplate}
          onPick={(values) => onChange(values)}
          presets={localized(LIQUID_PRESETS, t)}
        />
        <ChoiceRow<LiquidMode>
          description={a.refraction[1]}
          label={a.refraction[0]}
          onChange={(liquidMode) => onChange({ liquidMode })}
          options={modes.map((mode) => ({ value: mode, label: a.modes[mode], disabled: !liquid }))}
          value={appearance.liquidMode}
        />
        <SliderRow
          description={a.displacement[1]}
          disabled={!liquid}
          label={a.displacement[0]}
          max={150}
          min={0}
          onChange={(displacementScale) => onChange({ displacementScale })}
          value={appearance.displacementScale}
        />
        <SliderRow
          description={glassInfo.mode === 'live' ? a.aberrationLive : a.aberrationHint}
          disabled={!liquid || glassInfo.mode === 'live'}
          format={decimal(1)}
          label={a.aberration}
          max={10}
          min={0}
          onChange={(aberrationIntensity) => onChange({ aberrationIntensity })}
          step={0.1}
          value={appearance.aberrationIntensity}
        />
        <SliderRow
          description={a.elasticity[1]}
          disabled={!liquid || !appearance.animations}
          format={decimal(2)}
          label={a.elasticity[0]}
          max={0.5}
          min={0}
          onChange={(elasticity) => onChange({ elasticity })}
          step={0.01}
          value={appearance.elasticity}
        />
        <SliderRow
          description={a.frost[1]}
          format={decimal(2)}
          label={a.frost[0]}
          max={1}
          min={0}
          onChange={(frost) => onChange({ frost })}
          step={0.01}
          value={appearance.frost}
        />
        <SliderRow
          description={a.liquidSaturation[1]}
          format={percent}
          label={a.liquidSaturation[0]}
          max={250}
          min={50}
          onChange={(liquidSaturation) => onChange({ liquidSaturation })}
          value={appearance.liquidSaturation}
        />
        <SliderRow
          description={a.shade[1]}
          format={percent}
          label={a.shade[0]}
          max={50}
          min={0}
          onChange={(liquidShade) => onChange({ liquidShade })}
          value={appearance.liquidShade}
        />
      </div>
      <ResetButton onReset={onReset} />
    </section>
  )
}
