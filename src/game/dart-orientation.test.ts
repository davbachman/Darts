import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { applyDartLookAt, computeReadyDartRotation } from './dart-orientation'

describe('ready dart orientation', () => {
  it('keeps the dart nose aimed forward toward the board instead of upright', () => {
    const rotation = computeReadyDartRotation({ x: 0, y: 0 })

    expect(Math.abs(rotation.x)).toBeLessThan(0.2)
    expect(Math.abs(rotation.y)).toBeLessThan(0.2)
    expect(Math.abs(rotation.z)).toBeLessThan(0.2)
  })

  it('adds only subtle aim-following tilt near the edge of the board', () => {
    const rotation = computeReadyDartRotation({ x: 1, y: -1 })

    expect(Math.abs(rotation.x)).toBeLessThan(0.18)
    expect(Math.abs(rotation.y)).toBeLessThan(0.18)
    expect(Math.abs(rotation.z)).toBeLessThan(0.18)
  })

  it('keeps the dart level while yawing toward the target during flight', () => {
    const dart = new THREE.Object3D()
    dart.position.set(0.2, 1.2, 0.5)
    const target = new THREE.Vector3(-0.1, -0.5, -7)

    applyDartLookAt(dart, target)

    const noseDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(dart.quaternion)
    const horizontalNoseDirection = new THREE.Vector3(noseDirection.x, 0, noseDirection.z).normalize()
    const horizontalTargetDirection = target.clone().sub(dart.position)
    horizontalTargetDirection.y = 0
    horizontalTargetDirection.normalize()

    expect(Math.abs(noseDirection.y)).toBeLessThan(0.001)
    expect(horizontalNoseDirection.dot(horizontalTargetDirection)).toBeGreaterThan(0.999)
  })
})
