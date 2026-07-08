export interface Vec3Like {
  x: number
  y: number
  z: number
}

export function computeDartFlightPoint(
  start: Vec3Like,
  end: Vec3Like,
  progress: number,
  velocity: number,
): Vec3Like {
  const t = clamp01(progress)
  const arcHeight = Math.min(1.35, 1.05 + velocity * 0.1)
  const sideBend = Math.min(0.2, 0.08 + velocity * 0.025)

  return {
    x: lerp(start.x, end.x, t) + sideBend * Math.sin(Math.PI * t),
    y: lerp(start.y, end.y, t) + arcHeight * 4 * t * (1 - t),
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
