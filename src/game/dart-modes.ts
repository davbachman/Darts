import type { StandardDartScore } from './dartboard'

export type DartsGameMode = 'practice' | '301' | 'cricket' | 'around-the-clock'
export type CricketTarget = 20 | 19 | 18 | 17 | 16 | 15 | 'bull'
export type ClockTarget = number | 'bull' | 'complete'
export type DartsModeStatus = 'active' | 'complete'

export interface DartsModeDefinition {
  id: DartsGameMode
  label: string
  description: string
  playerCount: 1 | 2
}

export interface CricketState {
  marks: Record<CricketTarget, number>
}

export interface DartsPlayerState {
  id: number
  name: string
  score: number
  remaining: number | null
  cricket: CricketState
  clockTarget: ClockTarget
}

export interface DartsModeState {
  mode: DartsGameMode
  status: DartsModeStatus
  activePlayer: number
  players: DartsPlayerState[]
  currentTurn: StandardDartScore[]
  turnStartRemaining: number | null
  winner: number | null
  lastDart: StandardDartScore | null
  lastEvent: string | null
}

export const cricketTargets = [20, 19, 18, 17, 16, 15, 'bull'] as const satisfies readonly CricketTarget[]

export const dartsGameModes: DartsModeDefinition[] = [
  {
    id: 'practice',
    label: 'Practice',
    description: 'Throw three darts and total the round.',
    playerCount: 1,
  },
  {
    id: '301',
    label: '301',
    description: 'Two players race down from 301 with straight-out rules.',
    playerCount: 2,
  },
  {
    id: 'cricket',
    label: 'Cricket',
    description: 'Close 20 through 15 and bull, scoring open extras.',
    playerCount: 2,
  },
  {
    id: 'around-the-clock',
    label: 'Around the Clock',
    description: 'Advance from 1 to 20, then bull.',
    playerCount: 2,
  },
]

export function createDartsModeState(mode: DartsGameMode): DartsModeState {
  const playerCount = dartsGameModes.find((candidate) => candidate.id === mode)?.playerCount ?? 1
  const remaining = mode === '301' ? 301 : null

  return {
    mode,
    status: 'active',
    activePlayer: 0,
    players: Array.from({ length: playerCount }, (_, index) => createPlayer(index, remaining)),
    currentTurn: [],
    turnStartRemaining: remaining,
    winner: null,
    lastDart: null,
    lastEvent: null,
  }
}

export function resetDartsMode(mode: DartsGameMode): DartsModeState {
  return createDartsModeState(mode)
}

export function applyDartToMode(state: DartsModeState, score: StandardDartScore): DartsModeState {
  if (state.status === 'complete') {
    return state
  }

  if (state.mode === 'practice') {
    return applyPracticeDart(state, score)
  }

  if (state.mode === '301') {
    return apply301Dart(state, score)
  }

  if (state.mode === 'cricket') {
    return applyCricketDart(state, score)
  }

  return applyAroundTheClockDart(state, score)
}

export function targetLabel(target: ClockTarget): string {
  if (target === 'bull') {
    return 'Bull'
  }

  if (target === 'complete') {
    return 'Done'
  }

  return String(target)
}

function applyPracticeDart(state: DartsModeState, score: StandardDartScore): DartsModeState {
  const currentTurn = [...state.currentTurn, score]
  const players = clonePlayers(state.players)
  players[0].score += score.points

  return {
    ...state,
    players,
    currentTurn,
    lastDart: score,
    lastEvent: `${score.label} +${score.points}`,
    status: currentTurn.length >= 3 ? 'complete' : 'active',
  }
}

function apply301Dart(state: DartsModeState, score: StandardDartScore): DartsModeState {
  const players = clonePlayers(state.players)
  const player = players[state.activePlayer]
  const turnStartRemaining =
    state.currentTurn.length === 0 ? (player.remaining ?? 301) : (state.turnStartRemaining ?? player.remaining ?? 301)
  const nextRemaining = (player.remaining ?? 301) - score.points
  const currentTurn = [...state.currentTurn, score]

  if (nextRemaining < 0) {
    player.remaining = turnStartRemaining
    return advanceTurn({
      ...state,
      players,
      currentTurn: [],
      turnStartRemaining: players[nextPlayerIndex(state)].remaining,
      lastDart: score,
      lastEvent: `${player.name} bust`,
    })
  }

  player.remaining = nextRemaining

  if (nextRemaining === 0) {
    return {
      ...state,
      players,
      currentTurn,
      turnStartRemaining,
      lastDart: score,
      lastEvent: `${player.name} wins`,
      status: 'complete',
      winner: state.activePlayer,
    }
  }

  const nextState = {
    ...state,
    players,
    currentTurn,
    turnStartRemaining,
    lastDart: score,
    lastEvent: `${player.name}: ${nextRemaining}`,
  }

  return currentTurn.length >= 3 ? advanceTurn(nextState) : nextState
}

function applyCricketDart(state: DartsModeState, score: StandardDartScore): DartsModeState {
  const players = clonePlayers(state.players)
  const player = players[state.activePlayer]
  const opponent = players[nextPlayerIndex(state)]
  const target = cricketTargetForScore(score)
  const currentTurn = [...state.currentTurn, score]

  if (target) {
    const marks = cricketMarksForScore(score)
    const currentMarks = player.cricket.marks[target]
    const closingMarks = Math.min(Math.max(0, 3 - currentMarks), marks)
    const scoringMarks = marks - closingMarks
    player.cricket.marks[target] = Math.min(3, currentMarks + marks)

    if (scoringMarks > 0 && opponent.cricket.marks[target] < 3) {
      player.score += cricketPointValue(target) * scoringMarks
    }
  }

  const winner = cricketWinner(players)
  const nextState: DartsModeState = {
    ...state,
    players,
    currentTurn,
    lastDart: score,
    lastEvent: target ? `${player.name}: ${targetLabel(target)} mark` : `${player.name}: miss`,
    status: winner === null ? 'active' : 'complete',
    winner,
  }

  return winner === null && currentTurn.length >= 3 ? advanceTurn(nextState) : nextState
}

function applyAroundTheClockDart(state: DartsModeState, score: StandardDartScore): DartsModeState {
  const players = clonePlayers(state.players)
  const player = players[state.activePlayer]
  const currentTurn = [...state.currentTurn, score]
  const didHitTarget =
    player.clockTarget === 'bull'
      ? score.area === 'outer-bull' || score.area === 'inner-bull'
      : score.segment === player.clockTarget

  if (didHitTarget) {
    player.clockTarget = nextClockTarget(player.clockTarget)
  }

  if (player.clockTarget === 'complete') {
    return {
      ...state,
      players,
      currentTurn,
      lastDart: score,
      lastEvent: `${player.name} wins`,
      status: 'complete',
      winner: state.activePlayer,
    }
  }

  const nextState = {
    ...state,
    players,
    currentTurn,
    lastDart: score,
    lastEvent: didHitTarget ? `${player.name}: next ${targetLabel(player.clockTarget)}` : `${player.name}: still ${targetLabel(player.clockTarget)}`,
  }

  return currentTurn.length >= 3 ? advanceTurn(nextState) : nextState
}

function advanceTurn(state: DartsModeState): DartsModeState {
  const activePlayer = nextPlayerIndex(state)
  return {
    ...state,
    activePlayer,
    currentTurn: [],
    turnStartRemaining: state.players[activePlayer].remaining,
  }
}

function nextPlayerIndex(state: DartsModeState): number {
  return (state.activePlayer + 1) % state.players.length
}

function createPlayer(index: number, remaining: number | null): DartsPlayerState {
  return {
    id: index,
    name: `Player ${index + 1}`,
    score: 0,
    remaining,
    cricket: { marks: createCricketMarks() },
    clockTarget: 1,
  }
}

function createCricketMarks(): Record<CricketTarget, number> {
  return {
    20: 0,
    19: 0,
    18: 0,
    17: 0,
    16: 0,
    15: 0,
    bull: 0,
  }
}

function clonePlayers(players: DartsPlayerState[]): DartsPlayerState[] {
  return players.map((player) => ({
    ...player,
    cricket: { marks: { ...player.cricket.marks } },
  }))
}

function cricketTargetForScore(score: StandardDartScore): CricketTarget | null {
  if (score.area === 'outer-bull' || score.area === 'inner-bull') {
    return 'bull'
  }

  if (
    score.segment === 20 ||
    score.segment === 19 ||
    score.segment === 18 ||
    score.segment === 17 ||
    score.segment === 16 ||
    score.segment === 15
  ) {
    return score.segment
  }

  return null
}

function cricketMarksForScore(score: StandardDartScore): number {
  if (score.area === 'inner-bull') {
    return 2
  }

  if (score.area === 'outer-bull') {
    return 1
  }

  return score.multiplier
}

function cricketPointValue(target: CricketTarget): number {
  return target === 'bull' ? 25 : target
}

function cricketWinner(players: DartsPlayerState[]): number | null {
  const [first, second] = players
  const firstClosed = cricketTargets.every((target) => first.cricket.marks[target] >= 3)
  const secondClosed = cricketTargets.every((target) => second.cricket.marks[target] >= 3)

  if (firstClosed && first.score >= second.score) {
    return 0
  }

  if (secondClosed && second.score >= first.score) {
    return 1
  }

  return null
}

function nextClockTarget(target: ClockTarget): ClockTarget {
  if (target === 'bull' || target === 'complete') {
    return 'complete'
  }

  return target >= 20 ? 'bull' : target + 1
}
