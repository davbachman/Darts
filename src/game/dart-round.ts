import { type BoardImpact, type DartScore, scoreDartImpact } from './scoring'

export interface DartThrow {
  impact: BoardImpact
  score: DartScore
}

export interface DartRoundState {
  throws: DartThrow[]
  totalScore: number
  status: 'active' | 'complete'
  maxThrows: number
}

const maxThrows = 3

export function createDartRound(): DartRoundState {
  return {
    throws: [],
    totalScore: 0,
    status: 'active',
    maxThrows,
  }
}

export function resetDartRound(): DartRoundState {
  return createDartRound()
}

export function recordDartThrow(round: DartRoundState, impact: BoardImpact): DartRoundState {
  if (round.status === 'complete' || round.throws.length >= round.maxThrows) {
    return round
  }

  const score = scoreDartImpact(impact)
  const throws = [...round.throws, { impact, score }]
  const totalScore = throws.reduce((total, dartThrow) => total + dartThrow.score.points, 0)

  return {
    ...round,
    throws,
    totalScore,
    status: throws.length >= round.maxThrows ? 'complete' : 'active',
  }
}
