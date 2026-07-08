import { describe, expect, it } from 'vitest'
import { computeDartFlightPoint, computeFlightDurationMs } from './flight'

describe('dart flight path', () => {
  it('starts and ends exactly at the requested points', () => {
    const start = { x: 0, y: 0, z: 2 }
    const end = { x: 0.5, y: -0.25, z: -7 }

    expect(computeDartFlightPoint(start, end, 0, 2)).toEqual(start)
    expect(computeDartFlightPoint(start, end, 1, 2)).toEqual(end)
  })

  it('flies along a concave-down arc above the straight line to the target', () => {
    const start = { x: 0, y: 0, z: 2 }
    const end = { x: 0, y: 0, z: -7 }
    const quarter = computeDartFlightPoint(start, end, 0.25, 2)
    const midpoint = computeDartFlightPoint(start, end, 0.5, 2)
    const threeQuarter = computeDartFlightPoint(start, end, 0.75, 2)

    expect(midpoint.z).toBeCloseTo(-2.5, 1)
    expect(quarter.y).toBeGreaterThan(0.45)
    expect(midpoint.y).toBeGreaterThan(quarter.y)
    expect(midpoint.y).toBeGreaterThan(threeQuarter.y)
    expect(midpoint.y).toBeGreaterThan(0.8)
    expect(threeQuarter.y).toBeGreaterThan(0.45)
    expect(Math.abs(midpoint.x)).toBeGreaterThan(0.03)
  })

  it('shortens flight duration as release velocity increases', () => {
    expect(computeFlightDurationMs(0.5)).toBeGreaterThan(computeFlightDurationMs(2.5))
    expect(computeFlightDurationMs(10)).toBe(260)
    expect(computeFlightDurationMs(0)).toBe(720)
    expect(computeFlightDurationMs(2)).toBeLessThan(520)
  })
})
