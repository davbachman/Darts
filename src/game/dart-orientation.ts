import * as THREE from 'three'

export interface Aim2 {
  x: number
  y: number
}

export interface EulerLike {
  x: number
  y: number
  z: number
}

export function computeReadyDartRotation(aim: Aim2): EulerLike {
  return {
    x: aim.y * -0.08,
    y: aim.x * 0.08,
    z: aim.x * -0.04,
  }
}

export function applyDartLookAt(object: THREE.Object3D, target: THREE.Vector3): void {
  const levelTarget = new THREE.Vector3(target.x, object.position.y, target.z)
  if (levelTarget.distanceToSquared(object.position) < 0.000001) {
    levelTarget.z = object.position.z - 1
  }

  object.lookAt(levelTarget)
  object.rotateY(Math.PI)
}
