export interface BoardImpact {
  x: number
  y: number
}

export const dartboardNumbers = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
] as const

export type DartboardArea = 'single' | 'double' | 'triple' | 'outer-bull' | 'inner-bull' | 'miss'

export interface StandardDartScore {
  area: DartboardArea
  segment: number | null
  multiplier: 0 | 1 | 2 | 3
  points: number
  label: string
  impact: BoardImpact
}

export type DartScore = StandardDartScore

const innerBullRadius = 0.06
const outerBullRadius = 0.14
const tripleInnerRadius = 0.52
const tripleOuterRadius = 0.62
const doubleInnerRadius = 0.9
const doubleOuterRadius = 1
const segmentArc = (Math.PI * 2) / dartboardNumbers.length

export function scoreDartImpact(impact: BoardImpact): StandardDartScore {
  const radius = Math.hypot(impact.x, impact.y)

  if (radius <= innerBullRadius) {
    return {
      area: 'inner-bull',
      segment: null,
      multiplier: 2,
      points: 50,
      label: 'Bullseye',
      impact,
    }
  }

  if (radius <= outerBullRadius) {
    return {
      area: 'outer-bull',
      segment: null,
      multiplier: 1,
      points: 25,
      label: 'Outer bull',
      impact,
    }
  }

  if (radius > doubleOuterRadius) {
    return {
      area: 'miss',
      segment: null,
      multiplier: 0,
      points: 0,
      label: 'Miss',
      impact,
    }
  }

  const segment = segmentForImpact(impact)
  const area = areaForRadius(radius)
  const multiplier = multiplierForArea(area)

  return {
    area,
    segment,
    multiplier,
    points: segment * multiplier,
    label: labelForScore(area, segment),
    impact,
  }
}

export function scoreFor(segment: number | 'bull', multiplier: 1 | 2 | 3 = 1): StandardDartScore {
  if (segment === 'bull') {
    return {
      area: multiplier === 2 ? 'inner-bull' : 'outer-bull',
      segment: null,
      multiplier: multiplier === 2 ? 2 : 1,
      points: multiplier === 2 ? 50 : 25,
      label: multiplier === 2 ? 'Bullseye' : 'Outer bull',
      impact: { x: 0, y: 0 },
    }
  }

  const area = multiplier === 3 ? 'triple' : multiplier === 2 ? 'double' : 'single'
  return {
    area,
    segment,
    multiplier,
    points: segment * multiplier,
    label: labelForScore(area, segment),
    impact: { x: 0, y: 0 },
  }
}

export function formatDartScore(score: StandardDartScore): string {
  if (score.area === 'miss') {
    return 'Miss'
  }

  if (score.area === 'inner-bull') {
    return 'Bull +50'
  }

  if (score.area === 'outer-bull') {
    return 'Outer bull +25'
  }

  const prefix = score.multiplier === 3 ? 'T' : score.multiplier === 2 ? 'D' : 'S'
  return `${prefix}${score.segment} +${score.points}`
}

export function formatDartHit(score: StandardDartScore): string {
  if (score.area === 'miss') {
    return 'Miss'
  }

  if (score.area === 'inner-bull' || score.area === 'outer-bull') {
    return 'Bull'
  }

  const prefix = score.multiplier === 3 ? 'T' : score.multiplier === 2 ? 'D' : 'S'
  return `${prefix}${score.segment}`
}

export function segmentForImpact(impact: BoardImpact): number {
  const clockwiseAngleFromTop = normalizeAngle(Math.atan2(impact.x, impact.y))
  const segmentIndex = Math.floor(((clockwiseAngleFromTop + segmentArc / 2) % (Math.PI * 2)) / segmentArc)
  return dartboardNumbers[segmentIndex]
}

function areaForRadius(radius: number): DartboardArea {
  if (radius >= doubleInnerRadius) {
    return 'double'
  }

  if (radius >= tripleInnerRadius && radius <= tripleOuterRadius) {
    return 'triple'
  }

  return 'single'
}

function multiplierForArea(area: DartboardArea): StandardDartScore['multiplier'] {
  if (area === 'double') {
    return 2
  }

  if (area === 'triple') {
    return 3
  }

  if (area === 'miss') {
    return 0
  }

  return 1
}

function labelForScore(area: DartboardArea, segment: number): string {
  if (area === 'double') {
    return `Double ${segment}`
  }

  if (area === 'triple') {
    return `Triple ${segment}`
  }

  return `Single ${segment}`
}

function normalizeAngle(angle: number): number {
  return angle < 0 ? angle + Math.PI * 2 : angle
}
