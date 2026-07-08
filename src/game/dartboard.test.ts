import { describe, expect, it } from 'vitest'
import { dartboardNumbers, formatDartHit, formatDartScore, scoreDartImpact, scoreFor } from './dartboard'

describe('standard dartboard scoring', () => {
  it('uses the standard clock order', () => {
    expect(dartboardNumbers).toEqual([
      20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
    ])
  })

  it('scores bulls and misses by radius', () => {
    expect(scoreDartImpact({ x: 0, y: 0 })).toMatchObject({
      area: 'inner-bull',
      segment: null,
      multiplier: 2,
      points: 50,
    })
    expect(scoreDartImpact({ x: 0.09, y: 0 })).toMatchObject({
      area: 'outer-bull',
      segment: null,
      multiplier: 1,
      points: 25,
    })
    expect(scoreDartImpact({ x: 1.08, y: 0 })).toMatchObject({
      area: 'miss',
      segment: null,
      multiplier: 0,
      points: 0,
    })
  })

  it('scores singles, triples, and doubles by segment', () => {
    expect(scoreDartImpact({ x: 0.35, y: 0 })).toMatchObject({
      area: 'single',
      segment: 6,
      multiplier: 1,
      points: 6,
    })
    expect(scoreDartImpact({ x: 0.58, y: 0 })).toMatchObject({
      area: 'triple',
      segment: 6,
      multiplier: 3,
      points: 18,
    })
    expect(scoreDartImpact({ x: 0.95, y: 0 })).toMatchObject({
      area: 'double',
      segment: 6,
      multiplier: 2,
      points: 12,
    })
  })

  it('formats standard dart results for the HUD', () => {
    expect(formatDartScore(scoreFor(20, 3))).toBe('T20 +60')
    expect(formatDartScore(scoreFor(18, 2))).toBe('D18 +36')
    expect(formatDartScore(scoreDartImpact({ x: 0, y: 0 }))).toBe('Bull +50')
    expect(formatDartScore(scoreDartImpact({ x: 1.08, y: 0 }))).toBe('Miss')
  })

  it('formats compact hit labels for current-turn slots', () => {
    expect(formatDartHit(scoreFor(20, 3))).toBe('T20')
    expect(formatDartHit(scoreFor(15, 1))).toBe('S15')
    expect(formatDartHit(scoreFor('bull', 1))).toBe('Bull')
    expect(formatDartHit(scoreDartImpact({ x: 1.08, y: 0 }))).toBe('Miss')
  })
})
