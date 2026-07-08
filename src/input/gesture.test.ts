import { describe, expect, it } from 'vitest'
import {
  ThrowGestureTracker,
  createHandFrameFromLandmarks,
  type HandFrame,
  type HandLandmark,
} from './gesture'

function landmarks(overrides: Partial<Record<number, Partial<HandLandmark>>>): HandLandmark[] {
  return Array.from({ length: 21 }, (_, index) => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    ...overrides[index],
  }))
}

function frame(overrides: Partial<HandFrame>): HandFrame {
  return {
    timestamp: 0,
    aimX: 0,
    aimY: 0,
    depth: 0.16,
    pinchRatio: 0.35,
    trackingConfidence: 1,
    ...overrides,
  }
}

describe('dart hand landmark mapping', () => {
  it('maps the thumb-index midpoint to amplified dart aim by default', () => {
    const mapped = createHandFrameFromLandmarks(
      landmarks({
        4: { x: 0.26, y: 0.5, z: -0.03 },
        8: { x: 0.3, y: 0.5, z: -0.03 },
      }),
      100,
    )

    expect(mapped.aimX).toBeCloseTo(0.88, 2)
    expect(mapped.aimY).toBeCloseTo(0, 2)
    expect(mapped.pinchRatio).toBeLessThan(0.42)
  })

  it('maps the camera vertical center to aim center and supports lower-screen aiming', () => {
    const centered = createHandFrameFromLandmarks(
      landmarks({
        4: { x: 0.48, y: 0.5, z: -0.03 },
        8: { x: 0.52, y: 0.5, z: -0.03 },
      }),
      100,
    )
    const lower = createHandFrameFromLandmarks(
      landmarks({
        4: { x: 0.48, y: 0.78, z: -0.03 },
        8: { x: 0.52, y: 0.78, z: -0.03 },
      }),
      116,
    )

    expect(centered.aimY).toBeCloseTo(0, 2)
    expect(lower.aimY).toBeLessThan(-1)
  })

  it('uses apparent hand size as depth so forward motion is visible before landmark z changes', () => {
    const close = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.5, y: 0.7, z: 0 },
        4: { x: 0.47, y: 0.5, z: -0.02 },
        8: { x: 0.51, y: 0.5, z: -0.02 },
        12: { x: 0.68, y: 0.25, z: -0.02 },
        20: { x: 0.32, y: 0.84, z: -0.02 },
      }),
      100,
    )
    const far = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.5, y: 0.58, z: -0.02 },
        4: { x: 0.47, y: 0.5, z: -0.02 },
        8: { x: 0.51, y: 0.5, z: -0.02 },
        12: { x: 0.56, y: 0.43, z: -0.02 },
        20: { x: 0.44, y: 0.61, z: -0.02 },
      }),
      116,
    )

    expect(close.depth).toBeGreaterThan(far.depth + 0.25)
  })

  it('does not classify a lower-screen open thumb-index pair as pinched because of large hand bounds', () => {
    const mapped = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.5, y: 1.18, z: -0.01 },
        4: { x: 0.38, y: 0.88, z: -0.02 },
        5: { x: 0.43, y: 0.84, z: -0.02 },
        8: { x: 0.62, y: 0.88, z: -0.02 },
        9: { x: 0.5, y: 0.58, z: -0.02 },
        13: { x: 0.44, y: 0.92, z: -0.02 },
        17: { x: 0.36, y: 1.1, z: -0.02 },
      }),
      100,
    )

    expect(mapped.aimY).toBeLessThan(-1)
    expect(mapped.pinchRatio).toBeGreaterThan(0.42)
    expect(mapped.handShape).toBe('open')
  })

  it('clamps aim to a bounded off-board range', () => {
    const mapped = createHandFrameFromLandmarks(
      landmarks({
        4: { x: 0.98, y: -0.2, z: 0 },
        8: { x: 0.99, y: -0.18, z: 0 },
      }),
      100,
    )

    expect(mapped.aimX).toBe(-1.25)
    expect(mapped.aimY).toBe(1.25)
  })
})

describe('dart throw gesture tracking', () => {
  it('enters pinched state, releases on unpinch, and estimates forward velocity from recent samples', () => {
    const tracker = new ThrowGestureTracker({ smoothingAlpha: 1 })

    const events = [
      tracker.update(frame({ timestamp: 0, depth: 0.15, pinchRatio: 0.38 })),
      tracker.update(frame({ timestamp: 80, aimX: 0.1, aimY: -0.05, depth: 0.25, pinchRatio: 0.34 })),
      tracker.update(frame({ timestamp: 170, aimX: 0.2, aimY: -0.1, depth: 0.46, pinchRatio: 0.32 })),
      tracker.update(frame({ timestamp: 220, aimX: 0.24, aimY: -0.12, depth: 0.58, pinchRatio: 0.9 })),
    ]

    expect(events[0].state).toBe('pinched')
    expect(events[3].state).toBe('released')
    expect(events[3].release?.velocity).toBeGreaterThan(1.6)
    expect(events[3].release?.aim).toEqual({ x: 0.24, y: -0.12 })
  })

  it('smooths jitter before reporting aim', () => {
    const tracker = new ThrowGestureTracker({ smoothingAlpha: 0.25 })

    tracker.update(frame({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.2 }))
    const next = tracker.update(frame({ timestamp: 16, aimX: 0.8, aimY: -0.8, depth: 0.24 }))

    expect(next.aim.x).toBeCloseTo(0.2, 2)
    expect(next.aim.y).toBeCloseTo(-0.2, 2)
  })

  it('releases when thumb and index separate by a normal unpinch distance', () => {
    const tracker = new ThrowGestureTracker({ smoothingAlpha: 1 })

    tracker.update(frame({ timestamp: 0, depth: 0.12, pinchRatio: 0.34 }))
    tracker.update(frame({ timestamp: 90, depth: 0.25, pinchRatio: 0.36 }))
    tracker.update(frame({ timestamp: 180, depth: 0.48, pinchRatio: 0.38 }))
    const released = tracker.update(frame({ timestamp: 230, depth: 0.55, pinchRatio: 0.58 }))

    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(1.5)
  })

  it('releases on a very small unpinch delta for responsive throws', () => {
    const tracker = new ThrowGestureTracker({ smoothingAlpha: 1 })

    tracker.update(frame({ timestamp: 0, depth: 0.16, pinchRatio: 0.31 }))
    tracker.update(frame({ timestamp: 100, depth: 0.34, pinchRatio: 0.34 }))
    tracker.update(frame({ timestamp: 180, depth: 0.52, pinchRatio: 0.36 }))
    const released = tracker.update(frame({ timestamp: 230, depth: 0.6, pinchRatio: 0.44 }))

    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(1.8)
  })
})
