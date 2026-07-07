export interface BoardImpact {
  x: number
  y: number
}

export interface DartScore {
  label: 'Bullseye' | 'Inner ring' | 'Middle ring' | 'Outer ring' | 'Miss'
  points: number
}

const rings: Array<{ radius: number; label: DartScore['label']; points: number }> = [
  { radius: 0.12, label: 'Bullseye', points: 50 },
  { radius: 0.32, label: 'Inner ring', points: 25 },
  { radius: 0.62, label: 'Middle ring', points: 10 },
  { radius: 1, label: 'Outer ring', points: 5 },
]

export function scoreDartImpact(impact: BoardImpact): DartScore {
  const distance = Math.hypot(impact.x, impact.y)
  const ring = rings.find((candidate) => distance <= candidate.radius)

  if (!ring) {
    return { label: 'Miss', points: 0 }
  }

  return { label: ring.label, points: ring.points }
}
