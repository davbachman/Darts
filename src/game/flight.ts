export interface Vec3Like {
  x: number
  y: number
  z: number
}

export type FlightPathStyle = 'low-arc' | 'straight' | 'tall-arc'

export function computeDartFlightPoint(
  start: Vec3Like,
  end: Vec3Like,
  progress: number,
  velocity: number,
): Vec3Like {
  return computeProjectileFlightPoint(start, end, progress, velocity, 'low-arc')
}

export function computeProjectileFlightPoint(
  start: Vec3Like,
  end: Vec3Like,
  progress: number,
  velocity: number,
  style: FlightPathStyle,
): Vec3Like {
  const t = clamp01(progress)

  if (style === 'straight') {
    return {
      x: lerp(start.x, end.x, t),
      y: lerp(start.y, end.y, t),
      z: lerp(start.z, end.z, t),
    }
  }

  const arcHeight = Math.min(1.35, 1.05 + velocity * 0.1)
  const tallArcHeight = Math.min(3.1, 2.35 + velocity * 0.18)
  const sideBend = style === 'low-arc' ? Math.min(0.2, 0.08 + velocity * 0.025) : 0
  const height = style === 'tall-arc' ? tallArcHeight : arcHeight

  return {
    x: lerp(start.x, end.x, t) + sideBend * Math.sin(Math.PI * t),
    y: lerp(start.y, end.y, t) + height * 4 * t * (1 - t),
    z: lerp(start.z, end.z, t),
  }
}

export function computeFlightDurationMs(velocity: number): number {
  return Math.round(clamp(720 - velocity * 140, 260, 720))
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}
