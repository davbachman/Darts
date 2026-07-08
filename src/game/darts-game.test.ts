import { describe, expect, it } from 'vitest'
import {
  dartboardVisualScale,
  heldAxeBladeDirection,
  heldWandTipWorldPosition,
  readyPosition,
  shouldShowReadyObject,
  wandTipWorldPosition,
} from './darts-game'

describe('dartboard display scale', () => {
  it('renders the realistic dartboard larger than the normalized scoring board', () => {
    expect(dartboardVisualScale).toBeGreaterThan(1)
  })
})

describe('ready object visibility', () => {
  it('keeps a basketball visible before the shot hold gesture is recognized', () => {
    expect(shouldShowReadyObject('basketball', false)).toBe(true)
  })

  it('keeps the dart hidden until its pinch hold is recognized', () => {
    expect(shouldShowReadyObject('dart', false)).toBe(false)
  })

  it('keeps the axe visible before the fist hold is recognized', () => {
    expect(shouldShowReadyObject('axe', false)).toBe(true)
  })

  it('keeps the wizard wand visible before the thumb-away hold is recognized', () => {
    expect(shouldShowReadyObject('fireball', false)).toBe(true)
  })

  it('keeps the slingshot frame visible while the marble itself is gesture-gated', () => {
    expect(shouldShowReadyObject('marble', false)).toBe(true)
  })

  it('places an idle basketball in the foreground ready pose', () => {
    const position = readyPosition({ x: 0, y: 0 }, 'basketball')

    expect(position.y).toBeLessThan(0)
    expect(position.z).toBeGreaterThan(0)
  })

  it('points the held wizard wand tip up and away from the target so the shaft stays visible', () => {
    const aim = { x: 0.1, y: -0.05 }
    const grip = readyPosition(aim, 'fireball')
    const tip = heldWandTipWorldPosition(aim)

    expect(tip.z).toBeGreaterThan(grip.z)
    expect(tip.y).toBeGreaterThan(grip.y + 0.3)
  })

  it('sweeps the held wand tip downrange through the vertical plane as the thumb tilts toward the target', () => {
    const aim = { x: 0, y: 0 }
    const grip = readyPosition(aim, 'fireball')
    const awayTip = heldWandTipWorldPosition(aim, -1)
    const targetTip = heldWandTipWorldPosition(aim, 1)

    expect(awayTip.z).toBeGreaterThan(grip.z)
    expect(targetTip.z).toBeLessThan(grip.z)
    expect(awayTip.y).toBeGreaterThan(targetTip.y)
  })

  it('starts a launched fireball from the target-facing wand tip', () => {
    const aim = { x: 0.1, y: -0.05 }
    const grip = readyPosition(aim, 'fireball')
    const tip = wandTipWorldPosition(aim)

    expect(tip.z).toBeLessThan(grip.z)
    expect(tip.x).toBeCloseTo(grip.x, 2)
    expect(tip.y).toBeCloseTo(grip.y, 2)
  })
})

describe('held axe orientation', () => {
  it('points the held axe blade toward the target like the thrown orientation, not sideways', () => {
    const direction = heldAxeBladeDirection({ x: 0, y: 0 })

    expect(direction.z).toBeLessThan(-0.7)
    expect(Math.abs(direction.x)).toBeLessThan(0.5)
  })

  it('keeps the held axe blade downrange across the aim range', () => {
    const left = heldAxeBladeDirection({ x: -1, y: -0.5 })
    const right = heldAxeBladeDirection({ x: 1, y: 0.5 })

    expect(left.z).toBeLessThan(-0.6)
    expect(right.z).toBeLessThan(-0.6)
  })
})

describe('held object depth travel', () => {
  it('moves the held wand and axe downrange as hand depth grows', () => {
    const aim = { x: 0, y: 0 }
    const wandNear = readyPosition(aim, 'fireball', 0.18)
    const wandPushed = readyPosition(aim, 'fireball', 0.66)
    const axeNear = readyPosition(aim, 'axe', 0.18)
    const axePushed = readyPosition(aim, 'axe', 0.66)

    expect(wandPushed.z).toBeLessThan(wandNear.z - 0.8)
    expect(axePushed.z).toBeLessThan(axeNear.z - 0.8)
    expect(wandPushed.x).toBeCloseTo(wandNear.x, 5)
    expect(wandPushed.y).toBeCloseTo(wandNear.y, 5)
  })

  it('keeps darts, basketballs, and marbles at the fixed ready depth', () => {
    const aim = { x: 0.2, y: 0.1 }

    expect(readyPosition(aim, 'dart', 0.66).z).toBeCloseTo(readyPosition(aim, 'dart', 0.18).z, 5)
    expect(readyPosition(aim, 'basketball', 0.66).z).toBeCloseTo(readyPosition(aim, 'basketball', 0.18).z, 5)
    expect(readyPosition(aim, 'marble', 0.66).z).toBeCloseTo(readyPosition(aim, 'marble', 0.18).z, 5)
  })

  it('launches the fireball from the pushed-forward wand tip', () => {
    const aim = { x: 0, y: 0 }

    expect(wandTipWorldPosition(aim, 0.66).z).toBeLessThan(wandTipWorldPosition(aim, 0.18).z - 0.8)
  })
})
