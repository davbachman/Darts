import { describe, expect, it } from 'vitest'
import { createDartRound, recordDartThrow, resetDartRound } from './dart-round'
import { scoreDartImpact } from './scoring'

describe('dart scoring', () => {
  it('scores simplified rings by distance from the board center', () => {
    expect(scoreDartImpact({ x: 0, y: 0 })).toEqual({ label: 'Bullseye', points: 50 })
    expect(scoreDartImpact({ x: 0.18, y: 0 })).toEqual({ label: 'Inner ring', points: 25 })
    expect(scoreDartImpact({ x: 0.38, y: 0 })).toEqual({ label: 'Middle ring', points: 10 })
    expect(scoreDartImpact({ x: 0.7, y: 0 })).toEqual({ label: 'Outer ring', points: 5 })
    expect(scoreDartImpact({ x: 1.08, y: 0 })).toEqual({ label: 'Miss', points: 0 })
  })
})

describe('dart round state', () => {
  it('tracks three throws, total score, and completion', () => {
    let round = createDartRound()

    round = recordDartThrow(round, { x: 0, y: 0 })
    round = recordDartThrow(round, { x: 0.38, y: 0 })
    round = recordDartThrow(round, { x: 1.08, y: 0 })

    expect(round.status).toBe('complete')
    expect(round.throws).toHaveLength(3)
    expect(round.totalScore).toBe(60)
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
