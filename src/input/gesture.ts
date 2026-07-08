export interface HandLandmark {
  x: number
  y: number
  z: number
}

export type HandShape = 'unknown' | 'pinched' | 'open'
export type FingerDirection = 'unknown' | 'toward-screen' | 'away-from-screen' | 'across-screen'

export interface HandFrame {
  timestamp: number
  aimX: number
  aimY: number
  depth: number
  pinchRatio: number
  trackingConfidence: number
  handedness?: 'Left' | 'Right'
  handShape?: HandShape
  fingerDirection?: FingerDirection
}

export interface ThrowRelease {
  aim: { x: number; y: number }
  velocity: number
}

export interface ThrowInputSnapshot {
  state: 'idle' | 'pinched' | 'released'
  aim: { x: number; y: number }
  depth: number
  release?: ThrowRelease
}

interface SmoothedSample {
  timestamp: number
  aimX: number
  aimY: number
  depth: number
}

export interface ThrowGestureTrackerOptions {
  smoothingAlpha?: number
  pinchEnterRatio?: number
  pinchReleaseRatio?: number
  velocityWindowMs?: number
  minimumVelocityWindowMs?: number
}

const thumbTipIndex = 4
const indexTipIndex = 8
const indexMcpIndex = 5
const minimumVisibleHandScale = 0.16
const maximumGestureNormalizationScale = 0.44
const apparentDepthScaleRange = 0.32
const maximumApparentDepth = 0.72
const maximumAimCoordinate = 1.25
const defaultDartAimScale = 2

export function createHandFrameFromLandmarks(
  landmarks: HandLandmark[],
  timestamp: number,
  trackingConfidence = 1,
  handedness?: 'Left' | 'Right',
): HandFrame {
  const thumbTip = landmarks[thumbTipIndex]
  const indexTip = landmarks[indexTipIndex]

  if (!thumbTip || !indexTip) {
    throw new Error('Hand landmarks must include thumb tip and index tip')
  }

  const pinchPoint = {
    x: (thumbTip.x + indexTip.x) / 2,
    y: (thumbTip.y + indexTip.y) / 2,
    z: (thumbTip.z + indexTip.z) / 2,
  }
  const pinchDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y)
  const handScale = Math.max(getLandmarkBoundsDiagonal(landmarks), minimumVisibleHandScale)
  const gestureScale = Math.min(handScale, maximumGestureNormalizationScale)
  const pinchRatio = pinchDistance / gestureScale
  const apparentHandScale = Math.max(getApparentHandScale(landmarks), minimumVisibleHandScale)
  const fingerDepth = Math.max(0, -pinchPoint.z)
  const apparentDepth =
    clamp01((apparentHandScale - minimumVisibleHandScale) / apparentDepthScaleRange) * maximumApparentDepth

  return {
    timestamp,
    aimX: clampAim((0.5 - pinchPoint.x) * 2 * defaultDartAimScale),
    aimY: clampAim((0.5 - pinchPoint.y) * 2 * defaultDartAimScale),
    depth: Math.max(fingerDepth, apparentDepth),
    pinchRatio,
    trackingConfidence,
    handedness,
    handShape: pinchRatio <= 0.42 ? 'pinched' : 'open',
    fingerDirection: estimateFingerDirection(landmarks),
  }
}

export class ThrowGestureTracker {
  private readonly smoothingAlpha: number
  private readonly pinchEnterRatio: number
  private readonly pinchReleaseRatio: number
  private readonly velocityWindowMs: number
  private readonly minimumVelocityWindowMs: number
  private samples: SmoothedSample[] = []
  private state: ThrowInputSnapshot['state'] = 'idle'

  constructor(options: ThrowGestureTrackerOptions = {}) {
    this.smoothingAlpha = options.smoothingAlpha ?? 0.35
    this.pinchEnterRatio = options.pinchEnterRatio ?? 0.42
    this.pinchReleaseRatio = options.pinchReleaseRatio ?? 0.43
    this.velocityWindowMs = options.velocityWindowMs ?? 250
    this.minimumVelocityWindowMs = options.minimumVelocityWindowMs ?? 150
  }

  update(frame: HandFrame): ThrowInputSnapshot {
    const sample = this.smooth(frame)
    const isPinched = frame.pinchRatio <= this.pinchEnterRatio
    this.samples.push(sample)
    this.samples = this.samples.filter(
      (candidate) => frame.timestamp - candidate.timestamp <= this.velocityWindowMs,
    )

    if (this.state === 'idle' && isPinched) {
      this.state = 'pinched'
      this.samples = [
        {
          timestamp: frame.timestamp,
          aimX: frame.aimX,
          aimY: frame.aimY,
          depth: frame.depth,
        },
      ]
    }

    if (this.state === 'pinched' && frame.pinchRatio >= this.pinchReleaseRatio) {
      this.state = 'released'
      return {
        state: 'released',
        aim: { x: sample.aimX, y: sample.aimY },
        depth: sample.depth,
        release: {
          aim: { x: sample.aimX, y: sample.aimY },
          velocity: this.estimateVelocity(frame.timestamp),
        },
      }
    }

    return {
      state: this.state,
      aim: { x: sample.aimX, y: sample.aimY },
      depth: sample.depth,
    }
  }

  reset(): void {
    this.samples = []
    this.state = 'idle'
  }

  private smooth(frame: HandFrame): SmoothedSample {
    const previous = this.samples.at(-1)

    if (!previous) {
      return {
        timestamp: frame.timestamp,
        aimX: frame.aimX,
        aimY: frame.aimY,
        depth: frame.depth,
      }
    }

    return {
      timestamp: frame.timestamp,
      aimX: lerp(previous.aimX, frame.aimX, this.smoothingAlpha),
      aimY: lerp(previous.aimY, frame.aimY, this.smoothingAlpha),
      depth: lerp(previous.depth, frame.depth, this.smoothingAlpha),
    }
  }

  private estimateVelocity(timestamp: number): number {
    const newest = this.samples.at(-1)

    if (!newest) {
      return 0
    }

    const oldestViable = this.samples.find(
      (sample) => timestamp - sample.timestamp >= this.minimumVelocityWindowMs,
    )
    const oldest = oldestViable ?? this.samples[0]

    if (!oldest || oldest.timestamp === newest.timestamp) {
      return 0
    }

    const seconds = (newest.timestamp - oldest.timestamp) / 1000
    return Math.max(0, (newest.depth - oldest.depth) / seconds)
  }
}

function estimateFingerDirection(landmarks: HandLandmark[]): FingerDirection {
  const indexTip = landmarks[indexTipIndex]
  const indexMcp = landmarks[indexMcpIndex]

  if (!indexTip || !indexMcp) {
    return 'unknown'
  }

  const zDelta = indexMcp.z - indexTip.z

  if (zDelta > 0.035) {
    return 'toward-screen'
  }

  if (zDelta < -0.035) {
    return 'away-from-screen'
  }

  return 'across-screen'
}

function getLandmarkBoundsDiagonal(landmarks: HandLandmark[]): number {
  const xs = landmarks.map((landmark) => landmark.x)
  const ys = landmarks.map((landmark) => landmark.y)

  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
}

function getApparentHandScale(landmarks: HandLandmark[]): number {
  return getLandmarkBoundsDiagonal(
    landmarks.filter((_, index) => index !== thumbTipIndex && index !== indexTipIndex),
  )
}

function clampAim(value: number): number {
  if (value >= maximumAimCoordinate) {
    return maximumAimCoordinate
  }

  if (value <= -maximumAimCoordinate) {
    return -maximumAimCoordinate
  }

  return value
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function lerp(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha
}
