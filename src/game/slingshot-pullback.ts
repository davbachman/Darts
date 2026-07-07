export interface SlingshotPoint3 {
  x: number
  y: number
  z: number
}

export interface SlingshotPullbackState {
  pullAmount: number
  leftFork: SlingshotPoint3
  rightFork: SlingshotPoint3
  pouch: SlingshotPoint3
  leftBandLength: number
  rightBandLength: number
}

export interface SlingshotPullbackOptions {
  relaxedDepth?: number
  pullDepthRange?: number
}

export interface SlingshotHoldDepthState {
  relaxedDepth: number | null
  currentDepth: number | null
}

export interface SlingshotVisualState {
  frameVisible: boolean
  marbleVisible: boolean
}

export const slingshotMarblePouchOffset: SlingshotPoint3 = { x: 0, y: 0, z: -0.12 }

const relaxedDepth = 0.58
const pullDepthRange = 0.22
const leftFork = { x: -0.24, y: 0.33, z: -0.06 }
const rightFork = { x: 0.24, y: 0.33, z: -0.06 }

export function computeSlingshotPullback(
  depth: number,
  options: SlingshotPullbackOptions = {},
): SlingshotPullbackState {
  const baselineDepth = options.relaxedDepth ?? relaxedDepth
  const range = Math.max(0.01, options.pullDepthRange ?? pullDepthRange)
  const linearPull = clamp01((baselineDepth - depth) / range)
  const pullAmount = Math.sqrt(linearPull)
  const pouch = {
    x: 0,
    y: 0.14 - pullAmount * 0.34,
    z: 0.03 + pullAmount * 0.68,
  }

  return {
    pullAmount,
    leftFork,
    rightFork,
    pouch,
    leftBandLength: distance3(leftFork, pouch),
    rightBandLength: distance3(rightFork, pouch),
  }
}

export function updateSlingshotHoldDepthState(
  previous: SlingshotHoldDepthState,
  isPinched: boolean,
  depth: number,
): SlingshotHoldDepthState {
  if (!isPinched) {
    return { relaxedDepth: null, currentDepth: null }
  }

  return {
    relaxedDepth: previous.relaxedDepth ?? depth,
    currentDepth: depth,
  }
}

export function resolveSlingshotVisualState(isPinched: boolean): SlingshotVisualState {
  return {
    frameVisible: true,
    marbleVisible: isPinched,
  }
}

function distance3(a: SlingshotPoint3, b: SlingshotPoint3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}
