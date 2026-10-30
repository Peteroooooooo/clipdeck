import type { Strings } from '../../app/i18n'

/**
 * A timestamp as a relative time ("just now", "3m ago", "Yesterday", ...), in the app's language.
 * `now` is when the panel was last shown, so the labels are right every time it opens.
 */
export function timeAgo(isoString: string, t: Strings['time'], now: number = Date.now()): string {
  const date = new Date(isoString)
  const diffMs = now - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return t.justNow
  if (diffMin < 60) return t.minutes(diffMin)
  if (diffHour < 24) return t.hours(diffHour)
  if (diffDay === 1) return t.yesterday
  if (diffDay < 30) return t.days(diffDay)
  return date.toLocaleDateString(t.locale, { month: 'short', day: 'numeric' })
}
