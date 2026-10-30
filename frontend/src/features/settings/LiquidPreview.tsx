import { MagnifyingGlass, PushPin } from '@phosphor-icons/react'
import { useT } from '../../app/i18n'
import { LiquidGlass } from '../../shared/ui/liquid/LiquidGlass'

// Stand-in clips that drift under the sample glass, so refraction, frost and saturation have
// something to act on (in live mode the real search bar floats over empty glass).
const SAMPLE_TONES = ['accent', 'success', 'warning', 'danger', 'accent'] as const

function SampleRows() {
  const t = useT()
  return (
    <div className="liquid-preview-rows">
      {t.appearance.previewRows.map(([title, meta], index) => (
        <div className="liquid-preview-row" key={title}>
          <span className={`liquid-preview-dot is-${SAMPLE_TONES[index % SAMPLE_TONES.length]}`} />
          <span className="liquid-preview-text">
            <strong>{title}</strong>
            <span>{meta}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

/** Live sample of the liquid glass, rendered with the unsaved settings. */
export function LiquidPreview() {
  const t = useT()
  // A fragment, not a wrapper: the stage is sticky within the Liquid Glass section, so it stays
  // in view while the sliders below it are dragged.
  return (
    <>
      <p className="liquid-preview-hint">{t.appearance.previewHint}</p>
      <div aria-hidden="true" className="liquid-preview-stage" data-testid="liquid-preview">
        <div className="liquid-preview-track">
          <SampleRows />
          <SampleRows />
        </div>
        <div className="liquid-preview-glass magnet-group">
          <LiquidGlass className="liquid-preview-search" magnetic>
            <MagnifyingGlass size={15} weight="bold" />
            <span>{t.panel.searchPlaceholder}</span>
          </LiquidGlass>
          <LiquidGlass className="liquid-preview-button" magnetic>
            <PushPin size={16} weight="fill" />
          </LiquidGlass>
        </div>
      </div>
    </>
  )
}
