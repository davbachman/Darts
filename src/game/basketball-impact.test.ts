import { describe, expect, it } from 'vitest'
import { resolveBasketballImpact } from './basketball-impact'

describe('basketball target impact', () => {
  it('passes through the open center when the impact is inside the hole', () => {
    expect(resolveBasketballImpact({ x: 0.12, y: -0.08 }, 0.3)).toBe('made')
  })

  it('bounces off the target when the impact misses the center hole', () => {
    expect(resolveBasketballImpact({ x: 0.31, y: 0 }, 0.3)).toBe('bounce')
  })
})
