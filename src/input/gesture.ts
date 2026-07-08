export interface HandLandmark {
  x: number
  y: number
  z: number
}

export type HandShape = 'unknown' | 'pinched' | 'fist' | 'open'
export type FingerDirection = 'unknown' | 'toward-screen' | 'away-from-screen' | 'across-screen'
export type ThumbDirection = FingerDirection
export type AimAnchor = 'pinch' | 'ring-finger' | 'fist'
export type PalmOrientation = 'unknown' | 'up' | 'down' | 'side'
export type ThrowGestureKind =
  | 'pinch-push'
  | 'fist-flick'
  | 'thumb-wand-flick'
  | 'fist-open-point'
  | 'palm-turn-shot'
  | 'pinch-pull-release'

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
  thumbDirection?: ThumbDirection
  wandTargetTilt?: number
  palmOrientation?: PalmOrientation
}

export interface ThrowRelease {
  aim: { x: number; y: number }
  velocity: number
  wandTargetTilt?: number
}

export interface ThrowInputSnapshot {
  state: 'idle' | 'pinched' | 'held' | 'released'
  aim: { x: number; y: number }
  depth: number
  wandTargetTilt?: number
  release?: ThrowRelease
}

interface SmoothedSample {
  timestamp: number
  aimX: number
  aimY: number
  depth: number
  wandTargetTilt?: number
}

export interface ThrowGestureTrackerOptions {
  gestureKind?: ThrowGestureKind
  smoothingAlpha?: number
  pinchEnterRatio?: number
  pinchReleaseRatio?: number
  velocityWindowMs?: number
  minimumVelocityWindowMs?: number
  releaseVelocityThreshold?: number
  pullbackReleaseDistance?: number
}

const thumbTipIndex = 4
const thumbMcpIndex = 2
const indexTipIndex = 8
const ringTipIndex = 16
const wristIndex = 0
const indexMcpIndex = 5
const middleMcpIndex = 9
const ringMcpIndex = 13
const pinkyMcpIndex = 17
const minimumVisibleHandScale = 0.16
const maximumGestureNormalizationScale = 0.44
const apparentDepthScaleRange = 0.32
const maximumApparentDepth = 0.72
const wandTargetTiltDepthRange = 0.07
const wizardHoldMaxTilt = 0.15
const wizardReleaseTilt = 0.3
const wizardMinimumReleaseVelocity = 2.2
const fistTipCurlMaxRatio = 0.42
const fistPinchMidpointMaxRatio = 0.34
const maximumAimCoordinate = 1.25

export function createHandFrameFromLandmarks(
  landmarks: HandLandmark[],
  timestamp: number,
  trackingConfidence = 1,
  handedness?: 'Left' | 'Right',
  aimAnchor: AimAnchor = 'pinch',
  aimScale = 1,
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
  const anchorPoint =
    aimAnchor === 'ring-finger'
      ? (landmarks[ringTipIndex] ?? pinchPoint)
      : aimAnchor === 'fist'
        ? (getPalmCenter(landmarks) ?? pinchPoint)
        : pinchPoint
  const pinchDistance = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y)
  const handScale = Math.max(getLandmarkBoundsDiagonal(landmarks), minimumVisibleHandScale)
  const gestureScale = Math.min(handScale, maximumGestureNormalizationScale)
  const pinchRatio = pinchDistance / gestureScale
  const apparentHandScale = Math.max(getApparentHandScale(landmarks), minimumVisibleHandScale)
  const fingerDepth = Math.max(0, -anchorPoint.z)
  const apparentDepth =
    clamp01((apparentHandScale - minimumVisibleHandScale) / apparentDepthScaleRange) * maximumApparentDepth

  return {
    timestamp,
    aimX: clampAim((0.5 - anchorPoint.x) * 2 * aimScale),
    aimY: clampAim((0.5 - anchorPoint.y) * 2 * aimScale),
    depth: Math.max(fingerDepth, apparentDepth),
    pinchRatio,
    trackingConfidence,
    handedness,
    handShape: estimateHandShape(landmarks, gestureScale),
    fingerDirection: estimateFingerDirection(landmarks),
    thumbDirection: estimateThumbDirection(landmarks),
    wandTargetTilt: estimateWandTargetTilt(landmarks),
    palmOrientation: estimatePalmOrientation(landmarks, handedness),
  }
}

export class ThrowGestureTracker {
  private readonly gestureKind: ThrowGestureKind
  private readonly smoothingAlpha: number
  private readonly pinchEnterRatio: number
  private readonly pinchReleaseRatio: number
  private readonly velocityWindowMs: number
  private readonly minimumVelocityWindowMs: number
  private readonly releaseVelocityThreshold: number
  private readonly pullbackReleaseDistance: number
  private samples: SmoothedSample[] = []
  private state: ThrowInputSnapshot['state'] = 'idle'
  private holdStartDepth = 0
  private minHeldDepth = 0

  constructor(options: ThrowGestureTrackerOptions = {}) {
    this.gestureKind = options.gestureKind ?? 'pinch-push'
    this.smoothingAlpha = options.smoothingAlpha ?? 0.35
    this.pinchEnterRatio = options.pinchEnterRatio ?? 0.42
    this.pinchReleaseRatio = options.pinchReleaseRatio ?? 0.43
    this.velocityWindowMs = options.velocityWindowMs ?? 250
    this.minimumVelocityWindowMs = options.minimumVelocityWindowMs ?? 150
    this.releaseVelocityThreshold = options.releaseVelocityThreshold ?? 1.7
    this.pullbackReleaseDistance =
      options.pullbackReleaseDistance ?? (this.gestureKind === 'pinch-pull-release' ? 0.025 : 0.12)
  }

  update(frame: HandFrame): ThrowInputSnapshot {
    const sample = this.smooth(frame)
    const isHoldFrame = this.isHoldFrame(frame)
    this.samples.push(sample)
    this.samples = this.samples.filter(
      (candidate) => frame.timestamp - candidate.timestamp <= this.velocityWindowMs,
    )

    if (this.state === 'idle' && isHoldFrame) {
      this.state = this.holdState()
      this.holdStartDepth = frame.depth
      this.minHeldDepth = frame.depth
      // Restart smoothing from the raw hold frame so stale pre-hold values
      // (e.g. a thumb tilt left high by the previous cast) cannot trigger an
      // instant release.
      this.samples = [
        {
          timestamp: frame.timestamp,
          aimX: frame.aimX,
          aimY: frame.aimY,
          depth: frame.depth,
          wandTargetTilt: frame.wandTargetTilt,
        },
      ]
    }

    const forwardVelocity = this.estimateVelocity(frame.timestamp)

    if (this.isHolding() && this.isReleaseFrame(frame, forwardVelocity)) {
      this.state = 'released'
      return {
        state: 'released',
        aim: { x: sample.aimX, y: sample.aimY },
        depth: sample.depth,
        wandTargetTilt: sample.wandTargetTilt,
        release: {
          aim: { x: sample.aimX, y: sample.aimY },
          velocity: this.releaseVelocity(forwardVelocity),
          wandTargetTilt: sample.wandTargetTilt,
        },
      }
    }

    if (this.isHolding() && this.gestureKind === 'pinch-pull-release' && !isHoldFrame) {
      this.state = 'idle'
      this.resetHeldDepthRange()
      return {
        state: 'idle',
        aim: { x: sample.aimX, y: sample.aimY },
        depth: sample.depth,
        wandTargetTilt: sample.wandTargetTilt,
      }
    }

    if (this.isHolding() && isHoldFrame) {
      this.updateHeldDepthRange(sample.depth)
    }

    return {
      state: this.state,
      aim: { x: sample.aimX, y: sample.aimY },
      depth: sample.depth,
      wandTargetTilt: sample.wandTargetTilt,
    }
  }

  reset(): void {
    this.samples = []
    this.state = 'idle'
    this.resetHeldDepthRange()
  }

  private smooth(frame: HandFrame): SmoothedSample {
    const previous = this.samples.at(-1)

    if (!previous) {
      return {
        timestamp: frame.timestamp,
        aimX: frame.aimX,
        aimY: frame.aimY,
        depth: frame.depth,
        wandTargetTilt: frame.wandTargetTilt,
      }
    }

    const wandTargetTilt =
      frame.wandTargetTilt === undefined
        ? previous.wandTargetTilt
        : previous.wandTargetTilt === undefined
          ? frame.wandTargetTilt
          : lerp(previous.wandTargetTilt, frame.wandTargetTilt, this.smoothingAlpha)

    return {
      timestamp: frame.timestamp,
      aimX: lerp(previous.aimX, frame.aimX, this.smoothingAlpha),
      aimY: lerp(previous.aimY, frame.aimY, this.smoothingAlpha),
      depth: lerp(previous.depth, frame.depth, this.smoothingAlpha),
      wandTargetTilt,
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

  private holdState(): ThrowInputSnapshot['state'] {
    return this.gestureKind === 'pinch-push' || this.gestureKind === 'pinch-pull-release' ? 'pinched' : 'held'
  }

  private isHolding(): boolean {
    return this.state === 'pinched' || this.state === 'held'
  }

  private isHoldFrame(frame: HandFrame): boolean {
    switch (this.gestureKind) {
      case 'pinch-push':
      case 'pinch-pull-release':
        return frame.pinchRatio <= this.pinchEnterRatio
      case 'fist-flick':
        return resolveHandShape(frame) === 'fist'
      case 'thumb-wand-flick':
        return (
          resolveHandShape(frame) === 'fist' &&
          resolveThumbDirection(frame) !== 'toward-screen' &&
          (frame.wandTargetTilt ?? -1) <= wizardHoldMaxTilt
        )
      case 'fist-open-point':
        return resolveHandShape(frame) === 'fist'
      case 'palm-turn-shot':
        return isBasketballHandCandidate(frame) && resolveFingerDirection(frame) !== 'toward-screen'
    }
  }

  private isReleaseFrame(frame: HandFrame, forwardVelocity: number): boolean {
    switch (this.gestureKind) {
      case 'pinch-push':
        return frame.pinchRatio >= this.pinchReleaseRatio
      case 'fist-flick':
        return resolveHandShape(frame) === 'fist' && forwardVelocity >= this.releaseVelocityThreshold
      case 'thumb-wand-flick':
        return resolveThumbDirection(frame) === 'toward-screen' || this.smoothedWandTilt() >= wizardReleaseTilt
      case 'fist-open-point':
        return resolveHandShape(frame) === 'open' && resolveFingerDirection(frame) === 'toward-screen'
      case 'palm-turn-shot':
        return (
          isBasketballHandCandidate(frame) &&
          (resolveFingerDirection(frame) === 'toward-screen' || forwardVelocity >= this.releaseVelocityThreshold)
        )
      case 'pinch-pull-release':
        return frame.pinchRatio >= this.pinchReleaseRatio && this.heldPullDistance() >= this.pullbackReleaseDistance
    }
  }

  private releaseVelocity(forwardVelocity: number): number {
    if (this.gestureKind === 'pinch-pull-release') {
      return this.heldPullDistance() * 6
    }

    if (this.gestureKind === 'thumb-wand-flick') {
      return Math.max(forwardVelocity, wizardMinimumReleaseVelocity)
    }

    return forwardVelocity
  }

  private smoothedWandTilt(): number {
    return this.samples.at(-1)?.wandTargetTilt ?? -1
  }

  private updateHeldDepthRange(depth: number): void {
    this.minHeldDepth = Math.min(this.minHeldDepth, depth)
  }

  private resetHeldDepthRange(): void {
    this.holdStartDepth = 0
    this.minHeldDepth = 0
  }

  private heldPullDistance(): number {
    return Math.max(0, this.holdStartDepth - this.minHeldDepth)
  }
}

function resolveHandShape(frame: HandFrame): HandShape {
  if (frame.handShape && frame.handShape !== 'unknown') {
    return frame.handShape
  }

  return frame.pinchRatio <= 0.42 ? 'pinched' : 'open'
}

function resolveFingerDirection(frame: HandFrame): FingerDirection {
  return frame.fingerDirection ?? 'unknown'
}

function resolveThumbDirection(frame: HandFrame): ThumbDirection {
  return frame.thumbDirection ?? 'unknown'
}

function isBasketballHandCandidate(frame: HandFrame): boolean {
  return resolveHandShape(frame) !== 'pinched'
}

// A fist and a thumb-index pinch can both produce a tiny thumb-index gap (a
// fist tucks the thumb against the curled index), so the pinch gap alone
// cannot separate them. A fist curls every fingertip to the palm AND keeps the
// thumb-index midpoint at the palm, while a genuine pinch meets the thumb on
// an index finger extended away from the palm. Curl and pinch gap are measured
// in 3D: an open hand pointing at the screen projects its fingertips onto the
// palm, and only the landmark depth separates it from a real fist.
function estimateHandShape(landmarks: HandLandmark[], handScale: number): HandShape {
  const palmCenter = getPalmCenter(landmarks)
  const pinchGapRatio = distance3d(landmarks[thumbTipIndex], landmarks[indexTipIndex]) / handScale

  if (!palmCenter) {
    return pinchGapRatio <= 0.42 ? 'pinched' : 'open'
  }

  const tipIndices = [indexTipIndex, 12, ringTipIndex, 20]
  const averageTipDistance =
    tipIndices.reduce((total, index) => total + distance3d(landmarks[index], palmCenter), 0) / tipIndices.length
  const tipsCurled = averageTipDistance / handScale < fistTipCurlMaxRatio
  const pinchMidpoint = {
    x: (landmarks[thumbTipIndex].x + landmarks[indexTipIndex].x) / 2,
    y: (landmarks[thumbTipIndex].y + landmarks[indexTipIndex].y) / 2,
    z: (landmarks[thumbTipIndex].z + landmarks[indexTipIndex].z) / 2,
  }
  const pinchNearPalm = distance2d(pinchMidpoint, palmCenter) / handScale < fistPinchMidpointMaxRatio

  if (tipsCurled && pinchNearPalm) {
    return 'fist'
  }

  if (pinchGapRatio <= 0.42) {
    return 'pinched'
  }

  return tipsCurled ? 'fist' : 'open'
}

function getPalmCenter(landmarks: HandLandmark[]): HandLandmark | null {
  const palmLandmarks = [wristIndex, indexMcpIndex, middleMcpIndex, ringMcpIndex, pinkyMcpIndex]
    .map((index) => landmarks[index])
    .filter((landmark): landmark is HandLandmark => Boolean(landmark))

  if (palmLandmarks.length < 3) {
    return null
  }

  return averageLandmarks(palmLandmarks)
}

function estimateFingerDirection(landmarks: HandLandmark[]): FingerDirection {
  const indexTip = landmarks[indexTipIndex]
  const indexMcp = landmarks[indexMcpIndex]
  const zDelta = indexMcp.z - indexTip.z

  if (zDelta > 0.035) {
    return 'toward-screen'
  }

  if (zDelta < -0.035) {
    return 'away-from-screen'
  }

  return 'across-screen'
}

function estimateThumbDirection(landmarks: HandLandmark[]): ThumbDirection {
  const thumbTip = landmarks[thumbTipIndex]
  const thumbMcp = landmarks[thumbMcpIndex]
  const zDelta = thumbMcp.z - thumbTip.z

  if (zDelta > 0.035) {
    return 'toward-screen'
  }

  if (zDelta < -0.035) {
    return 'away-from-screen'
  }

  return 'across-screen'
}

function estimateWandTargetTilt(landmarks: HandLandmark[]): number {
  const thumbTip = landmarks[thumbTipIndex]
  const thumbMcp = landmarks[thumbMcpIndex]
  const zDelta = thumbMcp.z - thumbTip.z

  return Math.max(-1, Math.min(1, zDelta / wandTargetTiltDepthRange))
}

function estimatePalmOrientation(landmarks: HandLandmark[], handedness?: 'Left' | 'Right'): PalmOrientation {
  const wrist = landmarks[wristIndex]
  const indexMcp = landmarks[indexMcpIndex]
  const pinkyMcp = landmarks[pinkyMcpIndex]
  const indexVector = subtractLandmark(indexMcp, wrist)
  const pinkyVector = subtractLandmark(pinkyMcp, wrist)
  const normal = cross(indexVector, pinkyVector)
  const handednessScale = handedness === 'Left' ? -1 : 1
  const verticalNormal = normal.y * handednessScale

  if (verticalNormal < -0.015) {
    return 'up'
  }

  if (verticalNormal > 0.015) {
    return 'down'
  }

  return 'side'
}

function averageLandmarks(landmarks: HandLandmark[]): HandLandmark {
  return {
    x: landmarks.reduce((total, landmark) => total + landmark.x, 0) / landmarks.length,
    y: landmarks.reduce((total, landmark) => total + landmark.y, 0) / landmarks.length,
    z: landmarks.reduce((total, landmark) => total + landmark.z, 0) / landmarks.length,
  }
}

function subtractLandmark(a: HandLandmark, b: HandLandmark): HandLandmark {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  }
}

function cross(a: HandLandmark, b: HandLandmark): HandLandmark {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
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

function distance2d(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function distance3d(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
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
