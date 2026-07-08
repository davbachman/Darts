import { describe, expect, it } from 'vitest'
import {
  dartboardVisualScale,
  readyDartPosition,
  shouldClearLandedObjectsAfterTurn,
  shouldShowReadyDart,
} from './darts-game'
import { applyDartToMode, createDartsModeState } from './dart-modes'
import { scoreFor } from './dartboard'

describe('dartboard display scale', () => {
  it('renders the realistic dartboard larger than the normalized scoring board', () => {
    expect(dartboardVisualScale).toBeGreaterThan(1)
  })
})

describe('turn-based board cleanup', () => {
  it('clears landed darts after a two-player mode advances to the next player', () => {
    let previous = createDartsModeState('cricket')
    let next = applyDartToMode(previous, scoreFor(20, 1))

    expect(shouldClearLandedObjectsAfterTurn(previous, next)).toBe(false)

    previous = next
    next = applyDartToMode(previous, scoreFor(19, 1))
    previous = next
    next = applyDartToMode(previous, scoreFor(18, 1))

    expect(next.activePlayer).toBe(1)
    expect(shouldClearLandedObjectsAfterTurn(previous, next)).toBe(true)
  })
})

describe('ready dart visibility and placement', () => {
  it('keeps the dart hidden until its pinch hold is recognized', () => {
    expect(shouldShowReadyDart(false)).toBe(false)
    expect(shouldShowReadyDart(true)).toBe(true)
  })

  it('places a ready dart in the foreground at the aimed position', () => {
    const position = readyDartPosition({ x: 0.2, y: 0.1 })

    expect(position.x).toBeCloseTo(0.23, 2)
    expect(position.y).toBeCloseTo(0.082, 3)
    expect(position.z).toBeGreaterThan(0)
  })
})
