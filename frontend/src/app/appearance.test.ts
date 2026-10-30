import { describe, expect, test } from 'vitest'
import { DEFAULT_APPEARANCE, normalizeAppearance } from './appearance'

describe('white and black points', () => {
  test('black always stays below white', () => {
    const crossed = normalizeAppearance({ ...DEFAULT_APPEARANCE, whitePoint: 50, blackPoint: 200 })
    expect([crossed.whitePoint, crossed.blackPoint]).toEqual([50, 46])
  })
})
