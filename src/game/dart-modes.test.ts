import { describe, expect, it } from 'vitest'
import {
  applyDartToMode,
  createDartsModeState,
  dartsGameModes,
  resetDartsMode,
  targetLabel,
  type CricketTarget,
} from './dart-modes'
import { scoreFor } from './dartboard'

describe('darts game mode metadata', () => {
  it('lists the four visible darts modes', () => {
    expect(dartsGameModes.map((mode) => mode.id)).toEqual([
      'practice',
      '301',
      'cricket',
      'around-the-clock',
    ])
  })
})

describe('practice mode', () => {
  it('records a three-dart practice round for one player', () => {
    let state = createDartsModeState('practice')

    state = applyDartToMode(state, scoreFor(20, 3))
    state = applyDartToMode(state, scoreFor(18, 2))
    state = applyDartToMode(state, scoreFor('bull', 2))

    expect(state.status).toBe('complete')
    expect(state.players).toHaveLength(1)
    expect(state.players[0].score).toBe(146)
    expect(state.currentTurn).toHaveLength(3)
  })
})

describe('301 mode', () => {
  it('alternates two-player three-dart turns and subtracts from 301', () => {
    let state = createDartsModeState('301')

    state = applyDartToMode(state, scoreFor(20, 3))
    state = applyDartToMode(state, scoreFor(20, 3))
    state = applyDartToMode(state, scoreFor(20, 3))

    expect(state.players[0].remaining).toBe(121)
    expect(state.players[1].remaining).toBe(301)
    expect(state.activePlayer).toBe(1)
    expect(state.currentTurn).toHaveLength(0)
  })

  it('busts the whole turn if a player goes below zero', () => {
    let state = createDartsModeState('301')
    state.players[0].remaining = 20

    state = applyDartToMode(state, scoreFor(20, 1))
    state = resetDartsMode('301')
    state.players[0].remaining = 20
    state = applyDartToMode(state, scoreFor(20, 3))

    expect(state.players[0].remaining).toBe(20)
    expect(state.activePlayer).toBe(1)
    expect(state.lastEvent).toBe('Player 1 bust')
  })

  it('wins on exact zero with straight-out rules', () => {
    let state = createDartsModeState('301')
    state.players[0].remaining = 40

    state = applyDartToMode(state, scoreFor(20, 2))

    expect(state.status).toBe('complete')
    expect(state.winner).toBe(0)
    expect(state.lastEvent).toBe('Player 1 wins')
  })
})

describe('cricket mode', () => {
  it('closes targets at three marks and scores extras until the opponent closes', () => {
    let state = createDartsModeState('cricket')

    state = applyDartToMode(state, scoreFor(20, 3))
    state = applyDartToMode(state, scoreFor(20, 1))

    expect(state.players[0].cricket.marks[20]).toBe(3)
    expect(state.players[0].score).toBe(20)
  })

  it('does not score extras after both players close a target', () => {
    let state = createDartsModeState('cricket')
    state.players[0].cricket.marks[20] = 3
    state.players[1].cricket.marks[20] = 3

    state = applyDartToMode(state, scoreFor(20, 3))

    expect(state.players[0].score).toBe(0)
  })

  it('wins after closing all targets while not trailing on points', () => {
    let state = createDartsModeState('cricket')

    for (const target of [20, 19, 18, 17, 16, 15, 'bull'] satisfies CricketTarget[]) {
      state.players[0].cricket.marks[target] = 3
    }

    state = applyDartToMode(state, scoreFor(20, 1))

    expect(state.status).toBe('complete')
    expect(state.winner).toBe(0)
  })
})

describe('around the clock mode', () => {
  it('advances only when the player hits the active target', () => {
    let state = createDartsModeState('around-the-clock')

    state = applyDartToMode(state, scoreFor(2, 1))
    expect(state.players[0].clockTarget).toBe(1)

    state = applyDartToMode(state, scoreFor(1, 3))
    expect(state.players[0].clockTarget).toBe(2)
  })

  it('wins after completing bull', () => {
    let state = createDartsModeState('around-the-clock')
    state.players[0].clockTarget = 'bull'

    state = applyDartToMode(state, scoreFor('bull', 1))

    expect(state.status).toBe('complete')
    expect(state.winner).toBe(0)
  })

  it('formats target labels', () => {
    expect(targetLabel(20)).toBe('20')
    expect(targetLabel('bull')).toBe('Bull')
  })
})
