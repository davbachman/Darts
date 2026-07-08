import { describe, expect, it } from 'vitest'
import { applyDartToMode, createDartsModeState } from './game/dart-modes'
import { scoreFor } from './game/scoring'
import { renderPubScoreboard, renderTurnSlots } from './scoreboard'

describe('pub chalkboard score sheets', () => {
  it('renders cricket as a traditional pub chalkboard target ledger', () => {
    let state = createDartsModeState('cricket')
    state = applyDartToMode(state, scoreFor(20, 3))
    state = applyDartToMode(state, scoreFor(19, 2))

    const html = renderPubScoreboard(state)

    expect(html).toContain('cricket-score-sheet')
    expect(html).toContain('01 CRICKET')
    expect(html).toContain('cricket-target-column')
    expect(html).toContain('BULL')
    expect(html).toContain('chalk-cricket-mark mark-3')
    expect(html).toContain('chalk-cricket-mark mark-2')
    expect(html).toContain('Player 1')
    expect(html).toContain('Player 2')
  })

  it('renders 301 as two pub score columns with remaining totals', () => {
    const state = applyDartToMode(createDartsModeState('301'), scoreFor(20, 3))

    const html = renderPubScoreboard(state)

    expect(html).toContain('countdown-score-sheet')
    expect(html).toContain('301')
    expect(html).toContain('Remaining')
    expect(html).toContain('241')
    expect(html).toContain('Player 1')
    expect(html).toContain('Player 2')
  })

  it('renders around the clock as current-target chalk columns', () => {
    const state = applyDartToMode(createDartsModeState('around-the-clock'), scoreFor(1, 1))

    const html = renderPubScoreboard(state)

    expect(html).toContain('clock-score-sheet')
    expect(html).toContain('AROUND THE CLOCK')
    expect(html).toContain('Current target')
    expect(html).toContain('2')
  })

  it('renders turn slots as chalked dart boxes', () => {
    const state = applyDartToMode(createDartsModeState('practice'), scoreFor(20, 3))

    const html = renderTurnSlots(state)

    expect(html).toContain('turn-slot filled')
    expect(html).toContain('T20')
    expect(html).toContain('turn-slot empty')
  })
})
