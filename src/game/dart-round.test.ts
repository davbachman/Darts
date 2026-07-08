import { describe, expect, it } from 'vitest'
import { createDartRound, recordDartThrow, resetDartRound } from './dart-round'
import { scoreDartImpact } from './scoring'

describe('dart scoring', () => {
  it('scores standard dartboard areas by segment, multiplier, and bull', () => {
    expect(scoreDartImpact({ x: 0, y: 0 })).toMatchObject({
      label: 'Bullseye',
      points: 50,
      area: 'inner-bull',
      segment: null,
      multiplier: 2,
    })
    expect(scoreDartImpact({ x: 0.35, y: 0 })).toMatchObject({
      label: 'Single 6',
      points: 6,
      area: 'single',
      segment: 6,
      multiplier: 1,
    })
    expect(scoreDartImpact({ x: 0.58, y: 0 })).toMatchObject({
      label: 'Triple 6',
      points: 18,
      area: 'triple',
      segment: 6,
      multiplier: 3,
    })
    expect(scoreDartImpact({ x: 0.95, y: 0 })).toMatchObject({
      label: 'Double 6',
      points: 12,
      area: 'double',
      segment: 6,
      multiplier: 2,
    })
    expect(scoreDartImpact({ x: 1.08, y: 0 })).toMatchObject({ label: 'Miss', points: 0 })
  })
})

describe('dart round state', () => {
  it('tracks three throws, total score, and completion', () => {
    let round = createDartRound()

    round = recordDartThrow(round, { x: 0, y: 0 })
    round = recordDartThrow(round, { x: 0.58, y: 0 })
    round = recordDartThrow(round, { x: 1.08, y: 0 })

    expect(round.status).toBe('complete')
    expect(round.throws).toHaveLength(3)
    expect(round.totalScore).toBe(68)
  })

  it('ignores extra throws after the round is complete and can reset', () => {
    let round = createDartRound()

    round = recordDartThrow(round, { x: 0, y: 0 })
    round = recordDartThrow(round, { x: 0, y: 0 })
    round = recordDartThrow(round, { x: 0, y: 0 })
    round = recordDartThrow(round, { x: 0, y: 0 })

    expect(round.throws).toHaveLength(3)
    expect(round.totalScore).toBe(150)
    expect(resetDartRound()).toEqual(createDartRound())
  })
})
