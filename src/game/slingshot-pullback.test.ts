import { describe, expect, it } from 'vitest'
import {
  computeSlingshotPullback,
  resolveSlingshotVisualState,
  slingshotMarblePouchOffset,
  updateSlingshotHoldDepthState,
} from './slingshot-pullback'

describe('slingshot pullback model', () => {
  it('moves the pouch backward and stretches both elastic bands as hand depth decreases', () => {
    const relaxed = computeSlingshotPullback(0.58, { relaxedDepth: 0.58 })
    const pulled = computeSlingshotPullback(0.36, { relaxedDepth: 0.58 })

    expect(pulled.pullAmount).toBeGreaterThan(relaxed.pullAmount)
    expect(pulled.pouch.z).toBeGreaterThan(relaxed.pouch.z)
    expect(pulled.leftBandLength).toBeGreaterThan(relaxed.leftBandLength)
    expect(pulled.rightBandLength).toBeGreaterThan(relaxed.rightBandLength)
  })

  it('treats the pinch-start depth as the relaxed position', () => {
    const closePinch = computeSlingshotPullback(0.12, { relaxedDepth: 0.12 })
    const pulledBack = computeSlingshotPullback(0.06, { relaxedDepth: 0.12 })
    const movedTowardScreen = computeSlingshotPullback(0.2, { relaxedDepth: 0.12 })

    expect(closePinch.pullAmount).toBe(0)
    expect(movedTowardScreen.pullAmount).toBe(0)
    expect(pulledBack.pullAmount).toBeGreaterThan(0.25)
    expect(pulledBack.pouch.z).toBeGreaterThan(closePinch.pouch.z + 0.12)
  })

  it('makes small movement away from the screen visibly pull the pouch', () => {
    const relaxed = computeSlingshotPullback(0.12, { relaxedDepth: 0.12 })
    const slightPull = computeSlingshotPullback(0.1, { relaxedDepth: 0.12 })

    expect(slightPull.pullAmount).toBeGreaterThan(0.2)
    expect(slightPull.pouch.z).toBeGreaterThan(relaxed.pouch.z + 0.1)
  })

  it('clamps pull amount to the playable stretch range', () => {
    expect(computeSlingshotPullback(0.8).pullAmount).toBe(0)
    expect(computeSlingshotPullback(0.05).pullAmount).toBe(1)
  })

  it('keeps the visible pouch travel compact through the full pull range', () => {
    const relaxed = computeSlingshotPullback(0.58, { relaxedDepth: 0.58 })
    const pulled = computeSlingshotPullback(0.36, { relaxedDepth: 0.58 })
    const smallMove = computeSlingshotPullback(0.53, { relaxedDepth: 0.58 })

    expect(pulled.pouch.y).toBeGreaterThanOrEqual(-0.25)
    expect(pulled.pouch.z).toBeLessThanOrEqual(0.75)
    expect(Math.abs(smallMove.pouch.y - relaxed.pouch.y)).toBeLessThan(0.22)
    expect(Math.abs(smallMove.pouch.z - relaxed.pouch.z)).toBeLessThan(0.45)
  })

  it('captures relaxed depth once at pinch entry and resets when no longer pinched', () => {
    const started = updateSlingshotHoldDepthState({ relaxedDepth: null, currentDepth: null }, true, 0.32)
    const movedCloser = updateSlingshotHoldDepthState(started, true, 0.55)
    const pulledBack = updateSlingshotHoldDepthState(movedCloser, true, 0.24)
    const released = updateSlingshotHoldDepthState(pulledBack, false, 0.24)

    expect(started).toEqual({ relaxedDepth: 0.32, currentDepth: 0.32 })
    expect(movedCloser).toEqual({ relaxedDepth: 0.32, currentDepth: 0.55 })
    expect(pulledBack).toEqual({ relaxedDepth: 0.32, currentDepth: 0.24 })
    expect(released).toEqual({ relaxedDepth: null, currentDepth: null })
  })

  it('keeps the slingshot visible while showing the marble only while pinched', () => {
    expect(resolveSlingshotVisualState(false)).toEqual({
      frameVisible: true,
      marbleVisible: false,
    })
    expect(resolveSlingshotVisualState(true)).toEqual({
      frameVisible: true,
      marbleVisible: true,
    })
  })

  it('places the marble on the target side of the pouch', () => {
    expect(slingshotMarblePouchOffset.z).toBeLessThanOrEqual(-0.1)
  })
})
