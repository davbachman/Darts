export type BasketballImpactOutcome = 'made' | 'bounce'

export interface BasketballImpactPoint {
  x: number
  y: number
}

export function resolveBasketballImpact(
  impact: BasketballImpactPoint,
  holeRadius: number,
): BasketballImpactOutcome {
  return Math.hypot(impact.x, impact.y) <= holeRadius ? 'made' : 'bounce'
}
