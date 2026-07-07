import { describe, expect, it } from 'vitest'
import { getMenuVariants, getPlayableVariants, variantRegistry } from './registry'

describe('variant registry', () => {
  it('registers every requested variant as playable', () => {
    expect(variantRegistry.map((variant) => variant.id)).toEqual([
      'darts',
      'wizard-spells',
      'basketball',
      'slingshot',
      'axe-throw',
    ])

    expect(getPlayableVariants().map((variant) => variant.id)).toEqual([
      'darts',
      'wizard-spells',
      'basketball',
      'slingshot',
      'axe-throw',
    ])
    expect(variantRegistry.filter((variant) => variant.status === 'locked')).toHaveLength(0)
  })

  it('shows every playable variant in the menu now that all five are stable', () => {
    expect(getMenuVariants().map((variant) => variant.id)).toEqual([
      'darts',
      'wizard-spells',
      'basketball',
      'slingshot',
      'axe-throw',
    ])
  })
})
