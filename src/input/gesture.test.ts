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

describe('hand landmark mapping', () => {
  it('maps mirrored camera x/y to normalized aim and derives pinch ratio', () => {
    const frame = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.5, y: 0.5, z: 0.05 },
        4: { x: 0.22, y: 0.4, z: -0.04 },
        8: { x: 0.28, y: 0.5, z: -0.04 },
      }),
      100,
    )

    expect(frame.aimX).toBeCloseTo(0.5, 2)
    expect(frame.aimY).toBeCloseTo(0.1, 2)
    expect(frame.depth).toBeGreaterThan(0)
    expect(frame.pinchRatio).toBeLessThan(0.6)
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
    expect(lower.aimY).toBeLessThan(-0.5)
  })

  it('uses apparent hand size as depth so moving away from the camera changes pullback', () => {
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
    const frame = createHandFrameFromLandmarks(
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

    expect(frame.aimY).toBeLessThan(-0.7)
    expect(frame.pinchRatio).toBeGreaterThan(0.42)
    expect(frame.handShape).toBe('open')
  })

  it('aims a ring-finger anchored frame from the ring fingertip instead of the pinch midpoint', () => {
    const frame = createHandFrameFromLandmarks(
      landmarks({
        4: { x: 0.3, y: 0.4, z: -0.02 },
        8: { x: 0.34, y: 0.42, z: -0.02 },
        16: { x: 0.6, y: 0.3, z: -0.05 },
      }),
      100,
      1,
      'Right',
      'ring-finger',
    )

    expect(frame.aimX).toBeCloseTo(-0.2, 2)
    expect(frame.aimY).toBeCloseTo(0.4, 2)
  })

  it('keeps the pinch midpoint anchor by default even when the ring finger sits elsewhere', () => {
    const frame = createHandFrameFromLandmarks(
      landmarks({
        4: { x: 0.3, y: 0.4, z: -0.02 },
        8: { x: 0.34, y: 0.42, z: -0.02 },
        16: { x: 0.6, y: 0.3, z: -0.05 },
      }),
      100,
    )

    expect(frame.aimX).toBeCloseTo((0.5 - 0.32) * 2, 2)
    expect(frame.aimY).toBeCloseTo((0.5 - 0.41) * 2, 2)
  })

  it('supports amplified dart aiming so normal hand movement can reach doubles and misses', () => {
    const edge = createHandFrameFromLandmarks(
      landmarks({
        4: { x: 0.26, y: 0.5, z: -0.03 },
        8: { x: 0.3, y: 0.5, z: -0.03 },
      }),
      100,
      1,
      'Right',
      'pinch',
      2,
    )
    const offBoard = createHandFrameFromLandmarks(
      landmarks({
        4: { x: 0.16, y: 0.5, z: -0.03 },
        8: { x: 0.2, y: 0.5, z: -0.03 },
      }),
      116,
      1,
      'Right',
      'pinch',
      2,
    )

    expect(edge.aimX).toBeGreaterThan(0.85)
    expect(edge.aimX).toBeLessThan(1)
    expect(offBoard.aimX).toBeGreaterThan(1)
  })

  it('aims a fist-anchored frame from the palm center instead of the pinch midpoint', () => {
    const frame = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.6, y: 0.9, z: -0.01 },
        4: { x: 0.3, y: 0.4, z: -0.02 },
        5: { x: 0.55, y: 0.6, z: -0.02 },
        8: { x: 0.34, y: 0.42, z: -0.02 },
        9: { x: 0.6, y: 0.58, z: -0.02 },
        13: { x: 0.65, y: 0.6, z: -0.02 },
        17: { x: 0.7, y: 0.62, z: -0.02 },
      }),
      100,
      1,
      'Right',
      'fist',
    )

    expect(frame.aimX).toBeCloseTo(-0.24, 2)
    expect(frame.aimY).toBeCloseTo(-0.32, 2)
  })

  it('classifies a fist with a tucked thumb as a fist even though the pinch gap is tiny', () => {
    const frame = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.5, y: 0.76, z: 0 },
        2: { x: 0.45, y: 0.66, z: -0.02 },
        4: { x: 0.51, y: 0.6, z: -0.03 },
        5: { x: 0.45, y: 0.58, z: -0.02 },
        8: { x: 0.5, y: 0.61, z: -0.03 },
        9: { x: 0.5, y: 0.57, z: -0.02 },
        12: { x: 0.51, y: 0.62, z: -0.03 },
        13: { x: 0.55, y: 0.58, z: -0.02 },
        16: { x: 0.53, y: 0.63, z: -0.03 },
        17: { x: 0.59, y: 0.6, z: -0.02 },
        20: { x: 0.55, y: 0.64, z: -0.03 },
      }),
      100,
    )

    expect(frame.pinchRatio).toBeLessThan(0.42)
    expect(frame.handShape).toBe('fist')
  })

  it('classifies a foreshortened open hand pointing at the screen as open, not a fist', () => {
    const frame = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.5, y: 0.68, z: 0.03 },
        2: { x: 0.44, y: 0.66, z: -0.02 },
        4: { x: 0.38, y: 0.64, z: -0.04 },
        5: { x: 0.44, y: 0.6, z: -0.02 },
        8: { x: 0.49, y: 0.56, z: -0.14 },
        9: { x: 0.5, y: 0.6, z: -0.02 },
        12: { x: 0.51, y: 0.57, z: -0.15 },
        13: { x: 0.55, y: 0.6, z: -0.02 },
        16: { x: 0.54, y: 0.58, z: -0.13 },
        17: { x: 0.58, y: 0.62, z: -0.02 },
        20: { x: 0.56, y: 0.6, z: -0.11 },
      }),
      100,
    )

    expect(frame.handShape).toBe('open')
    expect(frame.fingerDirection).toBe('toward-screen')
  })

  it('keeps a thumb-index pinch with casually curled fingers classified as pinched', () => {
    const frame = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.52, y: 0.8, z: 0 },
        4: { x: 0.44, y: 0.44, z: -0.03 },
        5: { x: 0.44, y: 0.6, z: -0.02 },
        8: { x: 0.46, y: 0.46, z: -0.03 },
        9: { x: 0.5, y: 0.6, z: -0.02 },
        12: { x: 0.5, y: 0.66, z: -0.02 },
        13: { x: 0.55, y: 0.61, z: -0.02 },
        16: { x: 0.55, y: 0.67, z: -0.02 },
        17: { x: 0.6, y: 0.63, z: -0.02 },
        20: { x: 0.59, y: 0.68, z: -0.02 },
      }),
      100,
    )

    expect(frame.pinchRatio).toBeLessThan(0.42)
    expect(frame.handShape).toBe('pinched')
  })

  it('detects thumb pointing toward the screen from thumb depth', () => {
    const frame = createHandFrameFromLandmarks(
      landmarks({
        2: { x: 0.44, y: 0.56, z: 0.04 },
        4: { x: 0.38, y: 0.48, z: -0.03 },
        8: { x: 0.58, y: 0.48, z: -0.01 },
      }),
      100,
    )

    expect((frame as { thumbDirection?: string }).thumbDirection).toBe('toward-screen')
  })

  it('detects thumb pointing away from the screen from thumb depth', () => {
    const frame = createHandFrameFromLandmarks(
      landmarks({
        2: { x: 0.44, y: 0.56, z: -0.04 },
        4: { x: 0.38, y: 0.48, z: 0.03 },
        8: { x: 0.58, y: 0.48, z: -0.01 },
      }),
      100,
    )

    expect((frame as { thumbDirection?: string }).thumbDirection).toBe('away-from-screen')
  })

  it('derives a wand target tilt from thumb depth rotation', () => {
    const awayPointing = createHandFrameFromLandmarks(
      landmarks({
        2: { x: 0.5, y: 0.5, z: -0.04 },
        4: { x: 0.39, y: 0.5, z: 0.03 },
        8: { x: 0.62, y: 0.52, z: -0.01 },
      }),
      100,
    )
    const targetPointing = createHandFrameFromLandmarks(
      landmarks({
        2: { x: 0.5, y: 0.5, z: 0.04 },
        4: { x: 0.39, y: 0.5, z: -0.03 },
        8: { x: 0.62, y: 0.52, z: -0.01 },
      }),
      116,
    )

    expect(awayPointing.wandTargetTilt).toBeLessThan(-0.9)
    expect(targetPointing.wandTargetTilt).toBeGreaterThan(0.9)
  })

  it('clamps aim to a bounded off-board range', () => {
    const frame = createHandFrameFromLandmarks(
      landmarks({
        4: { x: 0.98, y: -0.2, z: 0 },
        8: { x: 0.99, y: -0.18, z: 0 },
      }),
      100,
      1,
      'Right',
      'pinch',
      2,
    )

    expect(frame.aimX).toBe(-1.25)
    expect(frame.aimY).toBe(1.25)
  })
})

describe('throw gesture tracking', () => {
  it('enters pinched state, releases on unpinch, and estimates forward velocity from recent samples', () => {
    const tracker = new ThrowGestureTracker({ smoothingAlpha: 1 })

    const events = [
      tracker.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.15, pinchRatio: 0.38, trackingConfidence: 1 }),
      tracker.update({ timestamp: 80, aimX: 0.1, aimY: -0.05, depth: 0.25, pinchRatio: 0.34, trackingConfidence: 1 }),
      tracker.update({ timestamp: 170, aimX: 0.2, aimY: -0.1, depth: 0.46, pinchRatio: 0.32, trackingConfidence: 1 }),
      tracker.update({ timestamp: 220, aimX: 0.24, aimY: -0.12, depth: 0.58, pinchRatio: 0.9, trackingConfidence: 1 }),
    ]

    expect(events[0].state).toBe('pinched')
    expect(events[3].state).toBe('released')
    expect(events[3].release?.velocity).toBeGreaterThan(1.6)
    expect(events[3].release?.aim).toEqual({ x: 0.24, y: -0.12 })
  })

  it('smooths jitter before reporting aim', () => {
    const tracker = new ThrowGestureTracker({ smoothingAlpha: 0.25 })

    tracker.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.2, pinchRatio: 0.35, trackingConfidence: 1 })
    const next = tracker.update({
      timestamp: 16,
      aimX: 0.8,
      aimY: -0.8,
      depth: 0.24,
      pinchRatio: 0.35,
      trackingConfidence: 1,
    })

    expect(next.aim.x).toBeCloseTo(0.2, 2)
    expect(next.aim.y).toBeCloseTo(-0.2, 2)
  })

  it('smooths wand target tilt before reporting aim', () => {
    const tracker = new ThrowGestureTracker({ smoothingAlpha: 0.25 })

    tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: 0,
      depth: 0.2,
      pinchRatio: 0.8,
      trackingConfidence: 1,
      wandTargetTilt: -1,
    } satisfies HandFrame)
    const next = tracker.update({
      timestamp: 16,
      aimX: 0,
      aimY: 0,
      depth: 0.2,
      pinchRatio: 0.8,
      trackingConfidence: 1,
      wandTargetTilt: 1,
    } satisfies HandFrame)

    expect(next.wandTargetTilt).toBeCloseTo(-0.5, 2)
  })

  it('releases when thumb and index separate by a normal relaxed unpinch distance', () => {
    const tracker = new ThrowGestureTracker({ smoothingAlpha: 1 })

    tracker.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.12, pinchRatio: 0.34, trackingConfidence: 1 })
    tracker.update({ timestamp: 90, aimX: 0, aimY: 0, depth: 0.25, pinchRatio: 0.36, trackingConfidence: 1 })
    tracker.update({ timestamp: 180, aimX: 0, aimY: 0, depth: 0.48, pinchRatio: 0.38, trackingConfidence: 1 })
    const released = tracker.update({
      timestamp: 230,
      aimX: 0,
      aimY: 0,
      depth: 0.55,
      pinchRatio: 0.58,
      trackingConfidence: 1,
    })

    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(1.5)
  })

  it('releases on a small but deliberate unpinch after a forward push', () => {
    const tracker = new ThrowGestureTracker({ smoothingAlpha: 1 })

    tracker.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.12, pinchRatio: 0.32, trackingConfidence: 1 })
    tracker.update({ timestamp: 80, aimX: 0, aimY: 0, depth: 0.28, pinchRatio: 0.34, trackingConfidence: 1 })
    tracker.update({ timestamp: 170, aimX: 0, aimY: 0, depth: 0.5, pinchRatio: 0.36, trackingConfidence: 1 })
    const released = tracker.update({
      timestamp: 220,
      aimX: 0,
      aimY: 0,
      depth: 0.56,
      pinchRatio: 0.48,
      trackingConfidence: 1,
    })

    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(1.8)
  })

  it('releases on a very small unpinch delta for responsive throws', () => {
    const tracker = new ThrowGestureTracker({ smoothingAlpha: 1 })

    tracker.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.16, pinchRatio: 0.31, trackingConfidence: 1 })
    tracker.update({ timestamp: 100, aimX: 0, aimY: 0, depth: 0.34, pinchRatio: 0.34, trackingConfidence: 1 })
    tracker.update({ timestamp: 180, aimX: 0, aimY: 0, depth: 0.52, pinchRatio: 0.36, trackingConfidence: 1 })
    const released = tracker.update({
      timestamp: 230,
      aimX: 0,
      aimY: 0,
      depth: 0.6,
      pinchRatio: 0.44,
      trackingConfidence: 1,
    })

    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(1.8)
  })

  it('holds wizard wand on a fist and releases on a forward fist flick', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'fist-flick', smoothingAlpha: 1 })

    const held = tracker.update({
      timestamp: 0,
      aimX: 0.1,
      aimY: 0.2,
      depth: 0.12,
      pinchRatio: 0.8,
      handShape: 'fist',
      trackingConfidence: 1,
    })
    tracker.update({
      timestamp: 90,
      aimX: 0.12,
      aimY: 0.22,
      depth: 0.24,
      pinchRatio: 0.8,
      handShape: 'fist',
      trackingConfidence: 1,
    })
    const released = tracker.update({
      timestamp: 180,
      aimX: 0.14,
      aimY: 0.24,
      depth: 0.54,
      pinchRatio: 0.8,
      handShape: 'fist',
      trackingConfidence: 1,
    })

    expect(held.state).toBe('held')
    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(2)
  })

  it('holds wizard wand on a fist with thumb pointed away and releases when thumb points toward screen', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'thumb-wand-flick', smoothingAlpha: 1 })

    const held = tracker.update({
      timestamp: 0,
      aimX: 0.1,
      aimY: 0.2,
      depth: 0.12,
      pinchRatio: 0.8,
      handShape: 'fist',
      thumbDirection: 'away-from-screen',
      trackingConfidence: 1,
    })
    const released = tracker.update({
      timestamp: 180,
      aimX: 0.14,
      aimY: 0.24,
      depth: 0.54,
      pinchRatio: 0.8,
      handShape: 'fist',
      thumbDirection: 'toward-screen',
      trackingConfidence: 1,
    })

    expect(held.state).toBe('held')
    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(2)
  })

  it('arms the wizard wand from a real fist with a tucked thumb', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'thumb-wand-flick', smoothingAlpha: 1 })
    const tuckedThumbFist = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.5, y: 0.76, z: 0 },
        2: { x: 0.45, y: 0.66, z: -0.02 },
        4: { x: 0.51, y: 0.6, z: -0.03 },
        5: { x: 0.45, y: 0.58, z: -0.02 },
        8: { x: 0.5, y: 0.61, z: -0.03 },
        9: { x: 0.5, y: 0.57, z: -0.02 },
        12: { x: 0.51, y: 0.62, z: -0.03 },
        13: { x: 0.55, y: 0.58, z: -0.02 },
        16: { x: 0.53, y: 0.63, z: -0.03 },
        17: { x: 0.59, y: 0.6, z: -0.02 },
        20: { x: 0.55, y: 0.64, z: -0.03 },
      }),
      0,
    )

    expect(tuckedThumbFist.handShape).toBe('fist')

    const held = tracker.update(tuckedThumbFist)

    expect(held.state).toBe('held')
  })

  it('releases the wizard wand from a smoothed thumb tilt toward the target without requiring a fist shape', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'thumb-wand-flick', smoothingAlpha: 1 })

    tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: 0,
      depth: 0.2,
      pinchRatio: 0.8,
      handShape: 'fist',
      thumbDirection: 'across-screen',
      wandTargetTilt: -0.6,
      trackingConfidence: 1,
    })
    const released = tracker.update({
      timestamp: 160,
      aimX: 0,
      aimY: 0,
      depth: 0.2,
      pinchRatio: 0.6,
      handShape: 'open',
      thumbDirection: 'across-screen',
      wandTargetTilt: 0.6,
      trackingConfidence: 1,
    })

    expect(released.state).toBe('released')
  })

  it('gives a stationary wizard thumb flick a minimum fireball velocity', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'thumb-wand-flick', smoothingAlpha: 1 })

    tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: 0,
      depth: 0.2,
      pinchRatio: 0.8,
      handShape: 'fist',
      thumbDirection: 'away-from-screen',
      trackingConfidence: 1,
    })
    const released = tracker.update({
      timestamp: 160,
      aimX: 0,
      aimY: 0,
      depth: 0.2,
      pinchRatio: 0.8,
      handShape: 'fist',
      thumbDirection: 'toward-screen',
      trackingConfidence: 1,
    })

    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThanOrEqual(2)
  })

  it('does not instantly re-fire when re-arming right after a thumb flick left the smoothed tilt high', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'thumb-wand-flick' })

    const idleAfterCast = tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: 0,
      depth: 0.2,
      pinchRatio: 0.8,
      handShape: 'fist',
      thumbDirection: 'toward-screen',
      wandTargetTilt: 1,
      trackingConfidence: 1,
    })
    const rearmed = tracker.update({
      timestamp: 16,
      aimX: 0,
      aimY: 0,
      depth: 0.2,
      pinchRatio: 0.8,
      handShape: 'fist',
      thumbDirection: 'away-from-screen',
      wandTargetTilt: -1,
      trackingConfidence: 1,
    })

    expect(idleAfterCast.state).toBe('idle')
    expect(rearmed.state).toBe('held')
    expect(rearmed.release).toBeUndefined()
  })

  it('does not arm the wizard wand while the thumb tilt already leans toward the target', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'thumb-wand-flick', smoothingAlpha: 1 })

    const snapshot = tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: 0,
      depth: 0.2,
      pinchRatio: 0.8,
      handShape: 'fist',
      thumbDirection: 'across-screen',
      wandTargetTilt: 0.25,
      trackingConfidence: 1,
    })

    expect(snapshot.state).toBe('idle')
  })

  it('arms the wizard wand from a fist even when the thumb reads across the screen', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'thumb-wand-flick', smoothingAlpha: 1 })

    const held = tracker.update({
      timestamp: 0,
      aimX: 0.1,
      aimY: 0.2,
      depth: 0.12,
      pinchRatio: 0.8,
      handShape: 'fist',
      thumbDirection: 'across-screen',
      trackingConfidence: 1,
    })
    const released = tracker.update({
      timestamp: 180,
      aimX: 0.14,
      aimY: 0.24,
      depth: 0.54,
      pinchRatio: 0.8,
      handShape: 'fist',
      thumbDirection: 'toward-screen',
      trackingConfidence: 1,
    })

    expect(held.state).toBe('held')
    expect(released.state).toBe('released')
  })

  it('does not arm the wizard wand from a fist whose thumb already points toward the screen', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'thumb-wand-flick', smoothingAlpha: 1 })

    const snapshot = tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: 0,
      depth: 0.12,
      pinchRatio: 0.8,
      handShape: 'fist',
      thumbDirection: 'toward-screen',
      trackingConfidence: 1,
    })

    expect(snapshot.state).toBe('idle')
  })

  it('releases an axe when a held fist opens with the index finger pointed toward the screen', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'fist-open-point', smoothingAlpha: 1 })

    tracker.update({
      timestamp: 0,
      aimX: -0.2,
      aimY: 0.1,
      depth: 0.2,
      pinchRatio: 0.8,
      handShape: 'fist',
      trackingConfidence: 1,
    })
    const released = tracker.update({
      timestamp: 180,
      aimX: -0.1,
      aimY: 0.08,
      depth: 0.46,
      pinchRatio: 0.8,
      handShape: 'open',
      fingerDirection: 'toward-screen',
      trackingConfidence: 1,
    })

    expect(released.state).toBe('released')
    expect(released.release?.aim).toEqual({ x: -0.1, y: 0.08 })
  })

  it('keeps holding the axe while the hand stays a fist, even when curled fingers read toward the screen', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'fist-open-point', smoothingAlpha: 1 })

    const held = tracker.update({
      timestamp: 0,
      aimX: -0.2,
      aimY: 0.1,
      depth: 0.2,
      pinchRatio: 0.8,
      handShape: 'fist',
      fingerDirection: 'across-screen',
      trackingConfidence: 1,
    })
    const stillHeld = tracker.update({
      timestamp: 180,
      aimX: -0.1,
      aimY: 0.08,
      depth: 0.46,
      pinchRatio: 0.8,
      handShape: 'fist',
      fingerDirection: 'toward-screen',
      trackingConfidence: 1,
    })

    expect(held.state).toBe('held')
    expect(stillHeld.state).toBe('held')
    expect(stillHeld.release).toBeUndefined()
  })

  it('does not arm an axe from a genuine thumb-index pinch', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'fist-open-point', smoothingAlpha: 1 })

    const snapshot = tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: 0,
      depth: 0.2,
      pinchRatio: 0.2,
      handShape: 'pinched',
      fingerDirection: 'across-screen',
      trackingConfidence: 1,
    })

    expect(snapshot.state).toBe('idle')
  })

  it('arms an axe from a fist whose curled fingers already read toward the screen without firing', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'fist-open-point', smoothingAlpha: 1 })

    const snapshot = tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: 0,
      depth: 0.2,
      pinchRatio: 0.8,
      handShape: 'fist',
      fingerDirection: 'toward-screen',
      trackingConfidence: 1,
    })

    expect(snapshot.state).toBe('held')
    expect(snapshot.release).toBeUndefined()
  })

  it('releases a basketball when an open palm turns from up and away to down and toward the screen', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'palm-turn-shot', smoothingAlpha: 1 })

    const held = tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: -0.1,
      depth: 0.18,
      pinchRatio: 0.8,
      handShape: 'open',
      palmOrientation: 'up',
      fingerDirection: 'away-from-screen',
      trackingConfidence: 1,
    })
    const released = tracker.update({
      timestamp: 220,
      aimX: 0.05,
      aimY: 0.02,
      depth: 0.52,
      pinchRatio: 0.8,
      handShape: 'open',
      palmOrientation: 'down',
      fingerDirection: 'toward-screen',
      trackingConfidence: 1,
    })

    expect(held.state).toBe('held')
    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(1.4)
  })

  it('releases a basketball when fingers move from away from the camera to toward the camera', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'palm-turn-shot', smoothingAlpha: 1 })

    const held = tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: -0.1,
      depth: 0.18,
      pinchRatio: 0.8,
      handShape: 'open',
      fingerDirection: 'away-from-screen',
      trackingConfidence: 1,
    })
    const released = tracker.update({
      timestamp: 220,
      aimX: 0.05,
      aimY: 0.02,
      depth: 0.52,
      pinchRatio: 0.8,
      handShape: 'open',
      fingerDirection: 'toward-screen',
      trackingConfidence: 1,
    })

    expect(held.state).toBe('held')
    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(1.4)
  })

  it('uses finger direction instead of compact hand projection for basketball release', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'palm-turn-shot', smoothingAlpha: 1 })

    const held = tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: -0.1,
      depth: 0.18,
      pinchRatio: 0.8,
      handShape: 'fist',
      fingerDirection: 'away-from-screen',
      trackingConfidence: 1,
    })
    const released = tracker.update({
      timestamp: 220,
      aimX: 0.05,
      aimY: 0.02,
      depth: 0.52,
      pinchRatio: 0.8,
      handShape: 'fist',
      fingerDirection: 'toward-screen',
      trackingConfidence: 1,
    })

    expect(held.state).toBe('held')
    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(1.4)
  })

  it('releases a basketball from a fast push toward the screen even when finger direction stays across', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'palm-turn-shot', smoothingAlpha: 1 })

    const held = tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: -0.1,
      depth: 0.18,
      pinchRatio: 0.8,
      handShape: 'open',
      fingerDirection: 'away-from-screen',
      trackingConfidence: 1,
    })
    const released = tracker.update({
      timestamp: 180,
      aimX: 0.05,
      aimY: 0.02,
      depth: 0.56,
      pinchRatio: 0.8,
      handShape: 'open',
      fingerDirection: 'across-screen',
      trackingConfidence: 1,
    })

    expect(held.state).toBe('held')
    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(1.7)
  })

  it('keeps holding a basketball through a slow drift toward the screen', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'palm-turn-shot', smoothingAlpha: 1 })

    tracker.update({
      timestamp: 0,
      aimX: 0,
      aimY: -0.1,
      depth: 0.18,
      pinchRatio: 0.8,
      handShape: 'open',
      fingerDirection: 'away-from-screen',
      trackingConfidence: 1,
    })
    const drifted = tracker.update({
      timestamp: 400,
      aimX: 0,
      aimY: -0.08,
      depth: 0.28,
      pinchRatio: 0.8,
      handShape: 'open',
      fingerDirection: 'across-screen',
      trackingConfidence: 1,
    })

    expect(drifted.state).toBe('held')
  })

  it('releases a slingshot marble only after a pinched pullback and unpinch', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'pinch-pull-release', smoothingAlpha: 1 })

    tracker.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.55, pinchRatio: 0.32, trackingConfidence: 1 })
    const stillHeld = tracker.update({
      timestamp: 120,
      aimX: 0,
      aimY: 0,
      depth: 0.28,
      pinchRatio: 0.34,
      trackingConfidence: 1,
    })
    const released = tracker.update({
      timestamp: 210,
      aimX: 0.04,
      aimY: -0.03,
      depth: 0.22,
      pinchRatio: 0.58,
      trackingConfidence: 1,
    })

    expect(stillHeld.state).toBe('pinched')
    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(1)
  })

  it('bases slingshot release velocity on pull distance instead of pull speed', () => {
    const slow = new ThrowGestureTracker({ gestureKind: 'pinch-pull-release', smoothingAlpha: 1 })
    slow.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.58, pinchRatio: 0.32, trackingConfidence: 1 })
    slow.update({ timestamp: 500, aimX: 0, aimY: 0, depth: 0.36, pinchRatio: 0.34, trackingConfidence: 1 })
    const slowRelease = slow.update({
      timestamp: 900,
      aimX: 0,
      aimY: 0,
      depth: 0.36,
      pinchRatio: 0.58,
      trackingConfidence: 1,
    })

    const fast = new ThrowGestureTracker({ gestureKind: 'pinch-pull-release', smoothingAlpha: 1 })
    fast.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.58, pinchRatio: 0.32, trackingConfidence: 1 })
    fast.update({ timestamp: 90, aimX: 0, aimY: 0, depth: 0.36, pinchRatio: 0.34, trackingConfidence: 1 })
    const fastRelease = fast.update({
      timestamp: 180,
      aimX: 0,
      aimY: 0,
      depth: 0.36,
      pinchRatio: 0.58,
      trackingConfidence: 1,
    })

    const shallow = new ThrowGestureTracker({ gestureKind: 'pinch-pull-release', smoothingAlpha: 1 })
    shallow.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.58, pinchRatio: 0.32, trackingConfidence: 1 })
    shallow.update({ timestamp: 180, aimX: 0, aimY: 0, depth: 0.46, pinchRatio: 0.34, trackingConfidence: 1 })
    const shallowRelease = shallow.update({
      timestamp: 260,
      aimX: 0,
      aimY: 0,
      depth: 0.46,
      pinchRatio: 0.58,
      trackingConfidence: 1,
    })

    expect(slowRelease.release?.velocity).toBeCloseTo(fastRelease.release?.velocity ?? 0, 3)
    expect(slowRelease.release?.velocity ?? 0).toBeGreaterThan(shallowRelease.release?.velocity ?? 0)
  })

  it('releases a slingshot marble after a small deliberate pull so shot strength can vary', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'pinch-pull-release', smoothingAlpha: 1 })

    tracker.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.58, pinchRatio: 0.32, trackingConfidence: 1 })
    tracker.update({ timestamp: 180, aimX: 0, aimY: 0, depth: 0.54, pinchRatio: 0.34, trackingConfidence: 1 })
    const released = tracker.update({
      timestamp: 260,
      aimX: 0,
      aimY: 0,
      depth: 0.54,
      pinchRatio: 0.58,
      trackingConfidence: 1,
    })

    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(0)
    expect(released.release?.velocity).toBeLessThan(0.5)
  })

  it('keeps the stored slingshot pull when release-frame depth jumps during unpinch', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'pinch-pull-release', smoothingAlpha: 1 })

    tracker.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.58, pinchRatio: 0.32, trackingConfidence: 1 })
    tracker.update({ timestamp: 120, aimX: 0, aimY: 0, depth: 0.36, pinchRatio: 0.34, trackingConfidence: 1 })
    const released = tracker.update({
      timestamp: 240,
      aimX: 0,
      aimY: 0,
      depth: 0.62,
      pinchRatio: 0.58,
      trackingConfidence: 1,
    })

    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeCloseTo((0.58 - 0.36) * 6, 3)
  })

  it('returns to idle when a slingshot pinch opens before any meaningful pullback', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'pinch-pull-release', smoothingAlpha: 1 })

    tracker.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.42, pinchRatio: 0.32, trackingConfidence: 1 })
    const opened = tracker.update({
      timestamp: 120,
      aimX: 0,
      aimY: 0,
      depth: 0.42,
      pinchRatio: 0.58,
      trackingConfidence: 1,
    })

    expect(opened.state).toBe('idle')
    expect(opened.release).toBeUndefined()
  })

  it('bases slingshot velocity on the pinch-start depth instead of a later closer hand position', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'pinch-pull-release', smoothingAlpha: 1 })

    tracker.update({ timestamp: 0, aimX: 0, aimY: 0, depth: 0.42, pinchRatio: 0.32, trackingConfidence: 1 })
    tracker.update({ timestamp: 80, aimX: 0, aimY: 0, depth: 0.66, pinchRatio: 0.34, trackingConfidence: 1 })
    tracker.update({ timestamp: 160, aimX: 0, aimY: 0, depth: 0.32, pinchRatio: 0.34, trackingConfidence: 1 })
    const released = tracker.update({
      timestamp: 240,
      aimX: 0,
      aimY: 0,
      depth: 0.32,
      pinchRatio: 0.58,
      trackingConfidence: 1,
    })

    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeCloseTo((0.42 - 0.32) * 6, 3)
  })

  it('releases a slingshot marble when unpinching expands the thumb-index bounds at the pulled-back position', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'pinch-pull-release', smoothingAlpha: 1 })
    const closePinch = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.5, y: 0.72, z: -0.02 },
        4: { x: 0.48, y: 0.5, z: -0.02 },
        8: { x: 0.52, y: 0.5, z: -0.02 },
        9: { x: 0.5, y: 0.44, z: -0.02 },
        13: { x: 0.42, y: 0.58, z: -0.02 },
        17: { x: 0.36, y: 0.68, z: -0.02 },
      }),
      0,
    )
    const pulledPinch = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.5, y: 0.61, z: -0.02 },
        4: { x: 0.48, y: 0.5, z: -0.02 },
        8: { x: 0.52, y: 0.5, z: -0.02 },
        9: { x: 0.5, y: 0.47, z: -0.02 },
        13: { x: 0.46, y: 0.54, z: -0.02 },
        17: { x: 0.42, y: 0.6, z: -0.02 },
      }),
      120,
    )
    const pulledUnpinched = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.5, y: 0.61, z: -0.02 },
        4: { x: 0.25, y: 0.42, z: -0.02 },
        8: { x: 0.75, y: 0.42, z: -0.02 },
        9: { x: 0.5, y: 0.47, z: -0.02 },
        13: { x: 0.46, y: 0.54, z: -0.02 },
        17: { x: 0.42, y: 0.6, z: -0.02 },
      }),
      240,
    )

    tracker.update(closePinch)
    tracker.update(pulledPinch)
    const released = tracker.update(pulledUnpinched)

    expect(released.state).toBe('released')
    expect(released.release?.velocity).toBeGreaterThan(0)
  })

  it('does not arm or release a slingshot marble from an open hand moving near the bottom of the screen', () => {
    const tracker = new ThrowGestureTracker({ gestureKind: 'pinch-pull-release', smoothingAlpha: 1 })
    const openLower = createHandFrameFromLandmarks(
      landmarks({
        0: { x: 0.5, y: 1.18, z: -0.01 },
        4: { x: 0.38, y: 0.88, z: -0.02 },
        5: { x: 0.43, y: 0.84, z: -0.02 },
        8: { x: 0.62, y: 0.88, z: -0.02 },
        9: { x: 0.5, y: 0.58, z: -0.02 },
        13: { x: 0.44, y: 0.92, z: -0.02 },
        17: { x: 0.36, y: 1.1, z: -0.02 },
      }),
      0,
    )
    const lowerStillOpen = { ...openLower, timestamp: 120, aimY: -1, depth: openLower.depth + 0.18 }
    const opened = tracker.update(openLower)
    const moved = tracker.update(lowerStillOpen)

    expect(opened.state).toBe('idle')
    expect(moved.state).toBe('idle')
    expect(moved.release).toBeUndefined()
  })
})
