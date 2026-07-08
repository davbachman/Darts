import * as THREE from 'three'
import { createDartRound, recordDartThrow, resetDartRound, type DartRoundState } from './dart-round'
import { applyDartToMode, createDartsModeState, type DartsGameMode, type DartsModeState } from './dart-modes'
import { applyDartLookAt, computeReadyDartRotation } from './dart-orientation'
import { computeFlightDurationMs, computeProjectileFlightPoint, type Vec3Like } from './flight'
import { resolveBasketballImpact, type BasketballImpactOutcome } from './basketball-impact'
import {
  computeSlingshotPullback,
  resolveSlingshotVisualState,
  slingshotMarblePouchOffset,
  updateSlingshotHoldDepthState,
} from './slingshot-pullback'
import { dartboardNumbers, formatDartScore, scoreDartImpact } from './scoring'
import { GameSounds } from './sound'
import { type HandInputProvider } from '../input/hand-provider'
import { ThrowGestureTracker, type ThrowInputSnapshot } from '../input/gesture'
import { getGameVariantConfig, type GameVariantConfig, type ProjectileKind } from '../variants/config'
import type { VariantId } from '../variants/registry'

interface ActiveFlight {
  start: THREE.Vector3
  end: THREE.Vector3
  velocity: number
  elapsedMs: number
  durationMs: number
  impact: { x: number; y: number }
  mesh: THREE.Group
  projectile: ProjectileKind
  phase: 'outbound' | 'basketball-pass' | 'basketball-bounce'
  recorded: boolean
}

export interface DartsGameTextState {
  mode: VariantId
  variantLabel: string
  coordinateSystem: string
  providerStatus: string
  providerMessage: string
  gestureState: ThrowInputSnapshot['state']
  aim: { x: number; y: number }
  depth: number
  wandTargetTilt: number | null
  slingshotPull: number | null
  slingshotRelaxedDepth: number | null
  round: DartRoundState
  dartsMode: DartsModeState
  activeFlight: null | {
    progress: number
    impact: { x: number; y: number }
    projectile: ProjectileKind
    phase: ActiveFlight['phase']
  }
  stuckObjects: number
  impactMarks: number
  lastBasketballOutcome: BasketballImpactOutcome | null
}

const boardZ = -7
const readyZ = 2.2
const boardScale = 1.55
export const dartboardVisualScale = boardScale
const basketballHoleRadius = 0.3
const slingshotMarbleName = 'slingshot-marble'
const wandTipReach = 0.88
// Held wand orientation sweeps through the vertical plane facing the target:
// tip up-and-back while armed, tip downrange as the thumb tilts toward it.
const wandUpBackDirection = new THREE.Vector3(0.3, 0.8, 0.5)
const wandDownrangeDirection = new THREE.Vector3(0.12, -0.08, -1)
const fallbackHeldWandTargetTilt = -1

export class DartsGame {
  private readonly host: HTMLElement
  private readonly provider: HandInputProvider
  private readonly variant: GameVariantConfig
  private readonly tracker: ThrowGestureTracker
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  })
  private readonly rayGroup = new THREE.Group()
  private readonly readyObject: THREE.Group
  private readonly sounds = new GameSounds()
  private readonly landedObjects: THREE.Group[] = []
  private readonly impactMarks: THREE.Object3D[] = []
  private round = createDartRound()
  private dartsMode: DartsModeState
  private lastGesture: ThrowInputSnapshot = { state: 'idle', aim: { x: 0, y: 0 }, depth: 0 }
  private lastBasketballOutcome: BasketballImpactOutcome | null = null
  private slingshotRelaxedDepth: number | null = null
  private slingshotCurrentDepth: number | null = null
  private activeFlight: ActiveFlight | null = null
  private started = false

  constructor(
    host: HTMLElement,
    provider: HandInputProvider,
    variant: GameVariantConfig = getGameVariantConfig('darts'),
    dartsMode: DartsGameMode = 'practice',
  ) {
    this.host = host
    this.provider = provider
    this.variant = variant
    this.dartsMode = createDartsModeState(dartsMode)
    this.tracker = new ThrowGestureTracker({ gestureKind: variant.gestureKind })
    this.readyObject = createHeldObject(variant.projectile)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.domElement.id = 'game-canvas'
    this.renderer.domElement.setAttribute('aria-label', `${variant.label} throwing scene`)
    this.host.append(this.renderer.domElement)
    this.scene.background = new THREE.Color(0xe9f1f3)
    this.camera.position.set(0, 0.1, 6)
    this.camera.lookAt(0, 0, boardZ)

    this.scene.add(this.rayGroup)
    this.setupLights()
    this.setupRange()
    this.readyObject.visible = shouldShowReadyObject(variant.projectile, false)
    this.readyObject.position.copy(readyPosition({ x: 0, y: 0 }, variant.projectile))
    applyReadyObjectRotation(this.readyObject, variant.projectile, { x: 0, y: 0 }, undefined)
    setSlingshotMarbleVisible(this.readyObject, false)
    this.scene.add(this.readyObject)
    this.resize()
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    await this.provider.start()
    this.started = true
  }

  update(deltaMs: number, timestamp: number): void {
    if (!this.started) {
      return
    }

    const frame = this.provider.getFrame(timestamp)

    if (frame && this.dartsMode.status === 'active' && !this.activeFlight) {
      this.lastGesture = this.tracker.update(frame)
      this.updateHeldObject(frame.depth)

      if (this.lastGesture.release) {
        this.launchProjectile(this.lastGesture.release.aim, this.lastGesture.release.velocity)
      }
    }

    this.updateFlight(deltaMs)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  resize(): void {
    const rect = this.host.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    const height = Math.max(1, rect.height)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
  }

  resetRound(): void {
    this.round = resetDartRound()
    this.dartsMode = createDartsModeState(this.dartsMode.mode)
    this.activeFlight?.mesh.removeFromParent()
    this.activeFlight = null
    this.tracker.reset()
    this.lastGesture = { state: 'idle', aim: { x: 0, y: 0 }, depth: 0 }
    this.lastBasketballOutcome = null
    this.slingshotRelaxedDepth = null
    this.slingshotCurrentDepth = null
    this.landedObjects.splice(0).forEach((object) => object.removeFromParent())
    this.impactMarks.splice(0).forEach((mark) => mark.removeFromParent())
  }

  dispose(): void {
    this.provider.stop()
    this.sounds.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  getTextState(): DartsGameTextState {
    return {
      mode: this.variant.id,
      variantLabel: this.variant.label,
      coordinateSystem: 'aim x/y are normalized board coordinates; origin is board center; +x right, +y up',
      providerStatus: this.provider.status,
      providerMessage: this.lastGesture.state === this.variant.heldState ? this.variant.holdMessage : this.provider.statusMessage,
      gestureState: this.lastGesture.state,
      aim: this.lastGesture.aim,
      depth: this.lastGesture.depth,
      wandTargetTilt: this.lastGesture.wandTargetTilt ?? null,
      slingshotPull:
        this.variant.projectile === 'marble' && this.lastGesture.state === this.variant.heldState
          ? computeSlingshotPullback(this.slingshotCurrentDepth ?? this.lastGesture.depth, {
              relaxedDepth: this.slingshotRelaxedDepth ?? this.lastGesture.depth,
            }).pullAmount
          : null,
      slingshotRelaxedDepth: this.slingshotRelaxedDepth,
      round: this.round,
      dartsMode: this.dartsMode,
      activeFlight: this.activeFlight
        ? {
            progress: Math.min(1, this.activeFlight.elapsedMs / this.activeFlight.durationMs),
            impact: this.activeFlight.impact,
            projectile: this.activeFlight.projectile,
            phase: this.activeFlight.phase,
          }
        : null,
      stuckObjects: this.landedObjects.length,
      impactMarks: this.impactMarks.length,
      lastBasketballOutcome: this.lastBasketballOutcome,
    }
  }

  private setupLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa8b2bd, 2.1))
    const key = new THREE.DirectionalLight(0xffffff, 2.4)
    key.position.set(-3, 5, 5)
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(0x9bd7ff, 1.2)
    rim.position.set(4, 3, -3)
    this.scene.add(rim)
  }

  private setupRange(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 24),
      new THREE.MeshStandardMaterial({ color: 0xb7c7c5, roughness: 0.8 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, -2.05, -3.5)
    this.scene.add(floor)

    if (this.variant.target === 'board') {
      const wall = new THREE.Mesh(
        new THREE.PlaneGeometry(11, 7),
        new THREE.MeshStandardMaterial({ color: 0xd7e2e4, roughness: 0.9 }),
      )
      wall.position.set(0, 0.3, boardZ - 0.08)
      this.scene.add(wall)
    }

    this.scene.add(this.variant.target === 'hoop' ? createBasketballTarget() : createDartboard())
  }

  private updateHeldObject(rawDepth: number): void {
    const isHeld = this.lastGesture.state === this.variant.heldState

    if (this.variant.projectile === 'marble') {
      const visualState = resolveSlingshotVisualState(isHeld)
      this.readyObject.visible = visualState.frameVisible
      setSlingshotMarbleVisible(this.readyObject, visualState.marbleVisible)
      this.readyObject.position.copy(readyPosition(this.lastGesture.aim, this.variant.projectile))
      applyReadyObjectRotation(this.readyObject, this.variant.projectile, this.lastGesture.aim)

      if (!isHeld) {
        if (this.lastGesture.state !== 'released') {
          this.updateSlingshotDepthState(false, rawDepth)
          updateSlingshotPullback(this.readyObject, rawDepth, rawDepth)
        }

        return
      }

      const depthState = this.updateSlingshotDepthState(true, rawDepth)
      updateSlingshotPullback(this.readyObject, depthState.currentDepth ?? rawDepth, depthState.relaxedDepth ?? rawDepth)
      return
    }

    this.readyObject.visible = shouldShowReadyObject(this.variant.projectile, isHeld)

    if (!this.readyObject.visible) {
      return
    }

    this.readyObject.position.copy(
      readyPosition(this.lastGesture.aim, this.variant.projectile, this.lastGesture.depth),
    )
    applyReadyObjectRotation(this.readyObject, this.variant.projectile, this.lastGesture.aim, this.lastGesture.wandTargetTilt)
  }

  private updateSlingshotDepthState(isPinched: boolean, rawDepth: number): {
    relaxedDepth: number | null
    currentDepth: number | null
  } {
    const depthState = updateSlingshotHoldDepthState(
      {
        relaxedDepth: this.slingshotRelaxedDepth,
        currentDepth: this.slingshotCurrentDepth,
      },
      isPinched,
      rawDepth,
    )
    this.slingshotRelaxedDepth = depthState.relaxedDepth
    this.slingshotCurrentDepth = depthState.currentDepth
    return depthState
  }

  private launchProjectile(aim: { x: number; y: number }, velocity: number): void {
    const heldPosition = readyPosition(aim, this.variant.projectile, this.lastGesture.depth)
    const start =
      this.variant.projectile === 'fireball'
        ? wandTipWorldPosition(aim, this.lastGesture.depth)
        : this.variant.projectile === 'marble'
          ? slingshotPouchWorldPosition(
              aim,
              this.slingshotCurrentDepth ?? this.lastGesture.depth,
              this.slingshotRelaxedDepth ?? this.lastGesture.depth,
            )
          : heldPosition
    const end = new THREE.Vector3(aim.x * boardScale, aim.y * boardScale, boardZ + 0.14)
    const mesh = createProjectileMesh(this.variant.projectile)
    mesh.position.copy(start)
    this.scene.add(mesh)
    this.sounds.playLaunch(velocity)
    this.readyObject.visible = this.variant.projectile === 'marble'
    setSlingshotMarbleVisible(this.readyObject, false)
    this.slingshotRelaxedDepth = null
    this.slingshotCurrentDepth = null
    this.activeFlight = {
      start,
      end,
      velocity,
      elapsedMs: 0,
      durationMs: computeFlightDurationMs(velocity),
      impact: { x: aim.x, y: aim.y },
      mesh,
      projectile: this.variant.projectile,
      phase: 'outbound',
      recorded: false,
    }
  }

  private updateFlight(deltaMs: number): void {
    if (!this.activeFlight) {
      return
    }

    this.activeFlight.elapsedMs += deltaMs
    const progress = Math.min(1, this.activeFlight.elapsedMs / this.activeFlight.durationMs)
    const position = computeProjectileFlightPoint(
      vectorLike(this.activeFlight.start),
      vectorLike(this.activeFlight.end),
      progress,
      this.activeFlight.velocity,
      this.activeFlight.phase === 'outbound' ? this.variant.flightPath : 'straight',
    )

    this.activeFlight.mesh.position.set(position.x, position.y, position.z)
    applyProjectileMotion(this.activeFlight.mesh, this.activeFlight, this.variant.projectile)

    if (progress >= 1) {
      this.finishFlightPhase()
    }
  }

  private finishFlightPhase(): void {
    if (!this.activeFlight) {
      return
    }

    if (this.variant.impact === 'basketball' && this.activeFlight.phase === 'outbound') {
      this.finishBasketballImpact(this.activeFlight)
      return
    }

    const landed = this.activeFlight
    let clearLandedObjectsAfterTurn = false

    if (!landed.recorded) {
      const score = scoreDartImpact(landed.impact)
      const previousDartsMode = this.dartsMode
      this.dartsMode = applyDartToMode(this.dartsMode, score)
      clearLandedObjectsAfterTurn = shouldClearLandedObjectsAfterTurn(previousDartsMode, this.dartsMode)
      this.round = this.dartsMode.mode === 'practice' ? recordDartThrow(this.round, landed.impact) : this.round

      if (this.variant.impact !== 'basketball') {
        this.sounds.playImpact(this.variant.impact, score.points)
      }

      this.spawnImpactPopup(
        score.points > 0 ? formatDartScore(score) : 'Miss',
        score.points > 0 ? 'score' : 'miss',
        landed.end,
      )
    }

    if (this.variant.impact === 'stick') {
      this.landedObjects.push(landed.mesh)
      landed.mesh.position.copy(landed.end)

      if (landed.projectile === 'axe') {
        applyStuckAxePose(landed.mesh)
      } else {
        applyDartLookAt(landed.mesh, new THREE.Vector3(landed.end.x, landed.end.y, landed.end.z - 1))
      }
    } else if (this.variant.impact === 'basketball') {
      landed.mesh.removeFromParent()
    } else {
      this.addImpactMark(landed.impact)
      landed.mesh.removeFromParent()
    }

    if (clearLandedObjectsAfterTurn) {
      this.clearLandedObjects()
    }

    this.activeFlight = null
    this.tracker.reset()
  }

  private clearLandedObjects(): void {
    this.landedObjects.splice(0).forEach((object) => object.removeFromParent())
  }

  private finishBasketballImpact(flight: ActiveFlight): void {
    const outcome = resolveBasketballImpact(flight.impact, basketballHoleRadius)
    const made = outcome === 'made'
    this.lastBasketballOutcome = outcome
    this.round = recordDartThrow(this.round, made ? { x: 0, y: 0 } : { x: 1.1, y: 0 })
    this.sounds.playImpact(made ? 'made' : 'bounce')
    this.spawnImpactPopup(made ? 'Swish!' : 'Rim out', made ? 'score' : 'miss', flight.end)
    flight.recorded = true
    flight.phase = made ? 'basketball-pass' : 'basketball-bounce'
    flight.start = flight.end.clone()
    flight.end = made
      ? flight.end.clone().add(new THREE.Vector3(0, 0, -1.6))
      : flight.end.clone().add(new THREE.Vector3(Math.sign(flight.impact.x || 1) * 0.55, -0.55, 2.25))
    flight.elapsedMs = 0
    flight.durationMs = made ? 280 : 420
  }

  private addImpactMark(impact: { x: number; y: number }): void {
    const mark = this.variant.impact === 'scorch' ? createScorchMark() : createDentMark()
    mark.position.set(impact.x * boardScale, impact.y * boardScale, boardZ + 0.22)
    this.impactMarks.push(mark)
    this.scene.add(mark)
  }

  private spawnImpactPopup(text: string, tone: 'score' | 'miss', world: THREE.Vector3): void {
    const ndc = world.clone().project(this.camera)
    const popup = document.createElement('div')
    popup.className = `impact-pop ${tone === 'score' ? 'impact-pop-score' : 'impact-pop-miss'}`
    popup.textContent = text
    popup.style.left = `${((ndc.x + 1) / 2) * 100}%`
    popup.style.top = `${((1 - ndc.y) / 2) * 100}%`
    popup.addEventListener('animationend', () => popup.remove())
    this.host.append(popup)
  }
}

export function readyPosition(aim: { x: number; y: number }, projectile: ProjectileKind, depth = 0): THREE.Vector3 {
  const yOffset = projectile === 'basketball' ? -0.28 : 0
  return new THREE.Vector3(aim.x * 1.15, aim.y * 0.82 + yOffset, readyZ - heldDepthTravel(projectile, depth))
}

export function shouldClearLandedObjectsAfterTurn(previous: DartsModeState, next: DartsModeState): boolean {
  return previous.activePlayer !== next.activePlayer
}

function heldDepthTravel(projectile: ProjectileKind, depth: number): number {
  if (projectile !== 'fireball' && projectile !== 'axe') {
    return 0
  }

  return Math.max(0, Math.min(0.6, depth - 0.15)) * 2.6
}

export function heldWandTipWorldPosition(
  aim: { x: number; y: number },
  wandTargetTilt?: number,
  depth = 0,
): THREE.Vector3 {
  return readyPosition(aim, 'fireball', depth).add(heldWandTipOffsetForTilt(wandTargetTilt))
}

export function wandTipWorldPosition(aim: { x: number; y: number }, depth = 0): THREE.Vector3 {
  return readyPosition(aim, 'fireball', depth).add(new THREE.Vector3(0, 0, -wandTipReach))
}

function heldWandDirectionForTilt(wandTargetTilt?: number): THREE.Vector3 {
  const tilt = Math.max(-1, Math.min(1, wandTargetTilt ?? fallbackHeldWandTargetTilt))
  return new THREE.Vector3()
    .lerpVectors(wandUpBackDirection, wandDownrangeDirection, (tilt + 1) / 2)
    .normalize()
}

function heldWandTipOffsetForTilt(wandTargetTilt?: number): THREE.Vector3 {
  return heldWandDirectionForTilt(wandTargetTilt).multiplyScalar(wandTipReach * 0.9)
}

function slingshotPouchWorldPosition(
  aim: { x: number; y: number },
  depth: number,
  relaxedDepth: number,
): THREE.Vector3 {
  const pullback = computeSlingshotPullback(depth, { relaxedDepth })
  const offset = new THREE.Vector3(pullback.pouch.x, pullback.pouch.y, pullback.pouch.z)
  offset.applyEuler(new THREE.Euler(0.12, aim.x * 0.08, 0))
  return readyPosition(aim, 'marble').add(offset)
}

function createHeldObject(projectile: ProjectileKind): THREE.Group {
  if (projectile === 'fireball') {
    return createWandMesh()
  }

  if (projectile === 'marble') {
    return createSlingshotMesh()
  }

  return createProjectileMesh(projectile)
}

function createProjectileMesh(projectile: ProjectileKind): THREE.Group {
  switch (projectile) {
    case 'dart':
      return createDartMesh()
    case 'fireball':
      return createFireballMesh()
    case 'basketball':
      return createBasketballMesh()
    case 'marble':
      return createMarbleMesh()
    case 'axe':
      return createAxeMesh()
  }
}

export function shouldShowReadyObject(projectile: ProjectileKind, isHeld: boolean): boolean {
  return projectile !== 'dart' || isHeld
}

function applyReadyObjectRotation(
  object: THREE.Group,
  projectile: ProjectileKind,
  aim: { x: number; y: number },
  wandTargetTilt?: number,
): void {
  object.rotation.set(0, 0, 0)

  if (projectile === 'dart') {
    const rotation = computeReadyDartRotation(aim)
    object.rotation.set(rotation.x, rotation.y, rotation.z)
    return
  }

  if (projectile === 'fireball') {
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), heldWandDirectionForTilt(wandTargetTilt))
    object.rotateZ(-0.22 + aim.x * -0.04)
    return
  }

  if (projectile === 'axe') {
    object.quaternion.copy(heldAxeQuaternion(aim))
    return
  }

  if (projectile === 'basketball') {
    object.rotation.set(aim.y * -0.12, aim.x * 0.1, 0)
    return
  }

  object.rotation.set(0.12, aim.x * 0.08, 0)
}

function applyProjectileMotion(object: THREE.Group, flight: ActiveFlight, projectile: ProjectileKind): void {
  if (projectile === 'fireball') {
    object.rotation.z += 0.18
    return
  }

  if (projectile === 'basketball') {
    object.rotation.x = flight.elapsedMs * 0.015
    object.rotation.y = flight.elapsedMs * 0.009
    return
  }

  if (projectile === 'axe') {
    applyAxeOrientation(object, -flight.elapsedMs * 0.011, axeFlightYaw)
    return
  }

  applyDartLookAt(object, flight.end)
}

// The axe model's blade points along +x; yaw it downrange (slightly less than
// 90 degrees so the camera still catches the blade face), then tumble
// end-over-end around the world x axis like a thrown axe.
const axeFlightYaw = Math.PI / 2 - 0.35
const heldAxeCockTumble = 0.4

function axeOrientationQuaternion(tumble: number, yaw: number): THREE.Quaternion {
  const orientation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), tumble)
  orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw))
  return orientation
}

function applyAxeOrientation(object: THREE.Object3D, tumble: number, yaw: number): void {
  object.quaternion.copy(axeOrientationQuaternion(tumble, yaw))
}

function applyStuckAxePose(object: THREE.Object3D): void {
  applyAxeOrientation(object, 0.55, Math.PI / 2 - 0.55)
}

// Held pose matches the thrown orientation: blade downrange, head cocked back
// toward the thrower, nudged slightly by aim.
function heldAxeQuaternion(aim: { x: number; y: number }): THREE.Quaternion {
  return axeOrientationQuaternion(heldAxeCockTumble + aim.y * 0.08, axeFlightYaw + aim.x * 0.1)
}

export function heldAxeBladeDirection(aim: { x: number; y: number }): THREE.Vector3 {
  return new THREE.Vector3(1, 0, 0).applyQuaternion(heldAxeQuaternion(aim))
}

function createBasketballTarget(): THREE.Group {
  const target = new THREE.Group()
  target.position.set(0, 0, boardZ)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.52, 1.25, 96),
    new THREE.MeshStandardMaterial({
      color: 0xe9edf0,
      roughness: 0.62,
      metalness: 0.03,
      side: THREE.DoubleSide,
    }),
  )
  target.add(ring)

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.045, 12, 72),
    new THREE.MeshStandardMaterial({ color: 0xd95d2a, roughness: 0.36, metalness: 0.08 }),
  )
  rim.position.z = 0.08
  target.add(rim)

  const outerRim = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.035, 12, 96),
    new THREE.MeshStandardMaterial({ color: 0x273845, roughness: 0.46 }),
  )
  outerRim.position.z = 0.04
  target.add(outerRim)

  const leftPost = createHoopPost(-1.38)
  const rightPost = createHoopPost(1.38)
  target.add(leftPost, rightPost)
  return target
}

function createHoopPost(x: number): THREE.Mesh {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 2.9, 16),
    new THREE.MeshStandardMaterial({ color: 0x5a6a70, roughness: 0.5 }),
  )
  post.position.set(x, 0, -0.04)
  return post
}

function createDartboard(): THREE.Group {
  const board = new THREE.Group()
  board.position.set(0, 0, boardZ)
  board.scale.setScalar(dartboardVisualScale)
  const darkSingle = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.86 })
  const lightSingle = new THREE.MeshStandardMaterial({ color: 0xf0dfbd, roughness: 0.82 })
  const redBand = new THREE.MeshStandardMaterial({ color: 0xb72722, roughness: 0.72 })
  const greenBand = new THREE.MeshStandardMaterial({ color: 0x157342, roughness: 0.72 })
  const wire = new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.32, metalness: 0.65 })
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.48 })
  const sectorArc = (Math.PI * 2) / dartboardNumbers.length

  const back = new THREE.Mesh(
    new THREE.CircleGeometry(1.28, 160),
    new THREE.MeshStandardMaterial({ color: 0x111820, roughness: 0.65 }),
  )
  back.position.z = -0.035
  board.add(back)

  dartboardNumbers.forEach((number, index) => {
    const center = Math.PI / 2 - index * sectorArc
    const start = center - sectorArc / 2
    const end = center + sectorArc / 2
    const singleMaterial = index % 2 === 0 ? darkSingle : lightSingle
    const bandMaterial = index % 2 === 0 ? redBand : greenBand

    board.add(createBoardSector(0.14, 0.52, start, end, singleMaterial, 0.002))
    board.add(createBoardSector(0.52, 0.62, start, end, bandMaterial, 0.008))
    board.add(createBoardSector(0.62, 0.9, start, end, singleMaterial, 0.004))
    board.add(createBoardSector(0.9, 1, start, end, bandMaterial, 0.01))

    const label = createNumberLabel(number)
    label.position.set(Math.cos(center) * 1.14, Math.sin(center) * 1.14, 0.06)
    board.add(label)
  })

  ;[0.14, 0.52, 0.62, 0.9, 1].forEach((radius) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.006, 8, 160), wire)
    ring.position.z = 0.035
    board.add(ring)
  })

  dartboardNumbers.forEach((_, index) => {
    const angle = Math.PI / 2 - (index - 0.5) * sectorArc
    const separator = new THREE.Mesh(
      new THREE.BoxGeometry(0.006, 0.86, 0.01),
      wire,
    )
    separator.position.set(Math.cos(angle) * 0.57, Math.sin(angle) * 0.57, 0.04)
    separator.rotation.z = angle - Math.PI / 2
    board.add(separator)
  })

  const outerBull = new THREE.Mesh(new THREE.CircleGeometry(0.14, 64), greenBand)
  outerBull.position.z = 0.045
  const innerBull = new THREE.Mesh(new THREE.CircleGeometry(0.06, 48), redBand)
  innerBull.position.z = 0.055
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.04, 0.045, 12, 160), rimMaterial)
  rim.position.z = 0.025
  board.add(outerBull, innerBull, rim)
  return board
}

function createBoardSector(
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
  material: THREE.Material,
  z: number,
): THREE.Mesh {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, outerRadius, startAngle, endAngle, false)
  shape.lineTo(Math.cos(endAngle) * innerRadius, Math.sin(endAngle) * innerRadius)
  shape.absarc(0, 0, innerRadius, endAngle, startAngle, true)
  shape.closePath()
  const sector = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8), material)
  sector.position.z = z
  return sector
}

function createNumberLabel(number: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const context = canvas.getContext('2d')

  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#f7f0df'
    context.font = '700 46px Inter, Arial, sans-serif'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(String(number), canvas.width / 2, canvas.height / 2)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }))
  sprite.scale.set(0.22, 0.22, 1)
  return sprite
}

function createDartMesh(): THREE.Group {
  const group = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0x2d3439, metalness: 0.65, roughness: 0.28 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xb88735, metalness: 0.35, roughness: 0.38 })
  const shaftMaterial = new THREE.MeshStandardMaterial({ color: 0x151c24, metalness: 0.1, roughness: 0.46 })
  const flightMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f0e6,
    roughness: 0.52,
    side: THREE.DoubleSide,
  })
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.9, 20),
    shaftMaterial,
  )
  shaft.rotation.x = Math.PI / 2
  shaft.position.z = 0.2
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.34, 24), brass)
  barrel.rotation.x = Math.PI / 2
  barrel.position.z = -0.28
  const gripA = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.004, 8, 24), metal)
  gripA.position.z = -0.38
  const gripB = gripA.clone()
  gripB.position.z = -0.22
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.026, 0.24, 24),
    metal,
  )
  tip.rotation.x = -Math.PI / 2
  tip.position.z = -0.62
  const fins = [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4].map((angle) =>
    createTailFin(angle, flightMaterial),
  )
  const tailCap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10), metal)
  tailCap.position.z = 0.68
  group.add(shaft, barrel, gripA, gripB, tip, ...fins, tailCap)
  return group
}

function createWandMesh(): THREE.Group {
  const group = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.48, metalness: 0.04 })
  const leather = new THREE.MeshStandardMaterial({ color: 0x1d1416, roughness: 0.62 })
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8a94e, metalness: 0.75, roughness: 0.3 })
  const crystalMaterial = new THREE.MeshStandardMaterial({
    color: 0xffb45e,
    emissive: 0xff6a1f,
    emissiveIntensity: 1.6,
    roughness: 0.22,
  })

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.03, 1.3, 18), wood)
  shaft.rotation.x = Math.PI / 2
  shaft.position.z = -0.13
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.34, 18), leather)
  grip.rotation.x = Math.PI / 2
  grip.position.z = 0.42
  const gripRingFront = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.007, 8, 22), gold)
  gripRingFront.position.z = 0.26
  const gripRingBack = gripRingFront.clone()
  gripRingBack.position.z = 0.58
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 12), gold)
  pommel.position.z = 0.64
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.032, 0.09, 16), gold)
  collar.rotation.x = Math.PI / 2
  collar.position.z = -0.72
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), crystalMaterial)
  crystal.scale.z = 1.5
  crystal.position.z = -0.86
  const glow = new THREE.PointLight(0xff8a3c, 0.8, 2)
  glow.position.z = -0.86
  group.add(shaft, grip, gripRingFront, gripRingBack, pommel, collar, crystal, glow)
  return group
}

function createFireballMesh(): THREE.Group {
  const group = new THREE.Group()
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 24, 16),
    new THREE.MeshStandardMaterial({
      color: 0xffc34f,
      emissive: 0xff5a1f,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    }),
  )
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xff7b2e, transparent: true, opacity: 0.32 }),
  )
  const light = new THREE.PointLight(0xff7a2c, 1.2, 2.4)
  group.add(core, shell, light)
  return group
}

function createBasketballMesh(): THREE.Group {
  const group = new THREE.Group()
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 40, 24),
    new THREE.MeshStandardMaterial({ color: 0xd86b2d, roughness: 0.5 }),
  )
  const seamMaterial = new THREE.MeshStandardMaterial({ color: 0x1d1714, roughness: 0.55 })
  const seamA = new THREE.Mesh(new THREE.TorusGeometry(0.224, 0.006, 8, 72), seamMaterial)
  const seamB = seamA.clone()
  seamB.rotation.x = Math.PI / 2
  const seamC = seamA.clone()
  seamC.rotation.y = Math.PI / 2
  group.add(ball, seamA, seamB, seamC)
  return group
}

function createMarbleMesh(): THREE.Group {
  const group = new THREE.Group()
  const marble = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 28, 18),
    new THREE.MeshStandardMaterial({
      color: 0x7ed2ff,
      roughness: 0.18,
      metalness: 0.03,
      transparent: true,
      opacity: 0.92,
    }),
  )
  group.add(marble)
  return group
}

function createSlingshotMesh(): THREE.Group {
  const group = new THREE.Group()
  const relaxed = computeSlingshotPullback(0.58)
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a4725, roughness: 0.58, metalness: 0.02 })
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x4f2f1c, roughness: 0.68 })
  const band = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.36 })
  const leather = new THREE.MeshStandardMaterial({ color: 0x51331f, roughness: 0.72 })
  const trunkTop = new THREE.Vector3(0, 0.02, 0)
  const handleBase = new THREE.Vector3(0, -0.58, 0.02)
  const leftFork = new THREE.Vector3(relaxed.leftFork.x, relaxed.leftFork.y, relaxed.leftFork.z)
  const rightFork = new THREE.Vector3(relaxed.rightFork.x, relaxed.rightFork.y, relaxed.rightFork.z)
  const handle = createCylinderBetween(handleBase, trunkTop, 0.055, wood)
  const handleGripTop = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 8, 20), darkWood)
  handleGripTop.position.set(0, -0.2, 0.02)
  handleGripTop.rotation.x = Math.PI / 2
  const handleGripBottom = handleGripTop.clone()
  handleGripBottom.position.y = -0.38
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.072, 18, 12), wood)
  joint.position.copy(trunkTop)
  const leftForkMesh = createCylinderBetween(trunkTop, leftFork, 0.035, wood)
  const rightForkMesh = createCylinderBetween(trunkTop, rightFork, 0.035, wood)
  const leftCap = new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 10), darkWood)
  leftCap.position.copy(leftFork)
  const rightCap = leftCap.clone()
  rightCap.position.copy(rightFork)
  const leftBand = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 10), band)
  leftBand.name = 'slingshot-left-band'
  const rightBand = leftBand.clone()
  rightBand.name = 'slingshot-right-band'
  const pouch = new THREE.Group()
  pouch.name = 'slingshot-pouch'
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.035), leather)
  pad.rotation.x = 0.2
  const marble = createMarbleMesh()
  marble.name = slingshotMarbleName
  marble.scale.setScalar(0.92)
  marble.position.set(slingshotMarblePouchOffset.x, slingshotMarblePouchOffset.y, slingshotMarblePouchOffset.z)
  pouch.add(pad, marble)
  group.add(
    handle,
    handleGripTop,
    handleGripBottom,
    joint,
    leftForkMesh,
    rightForkMesh,
    leftCap,
    rightCap,
    leftBand,
    rightBand,
    pouch,
  )
  updateSlingshotPullback(group, 0.58, 0.58)
  return group
}

function setSlingshotMarbleVisible(group: THREE.Group, visible: boolean): void {
  const marble = group.getObjectByName(slingshotMarbleName)

  if (marble) {
    marble.visible = visible
  }
}

function updateSlingshotPullback(group: THREE.Group, depth: number, relaxedDepth: number): void {
  const pullback = computeSlingshotPullback(depth, { relaxedDepth })
  const pouch = group.getObjectByName('slingshot-pouch')
  const leftBand = group.getObjectByName('slingshot-left-band')
  const rightBand = group.getObjectByName('slingshot-right-band')
  const pouchPosition = new THREE.Vector3(pullback.pouch.x, pullback.pouch.y, pullback.pouch.z)
  const leftFork = new THREE.Vector3(pullback.leftFork.x, pullback.leftFork.y, pullback.leftFork.z)
  const rightFork = new THREE.Vector3(pullback.rightFork.x, pullback.rightFork.y, pullback.rightFork.z)

  if (pouch) {
    pouch.position.copy(pouchPosition)
    pouch.scale.setScalar(1 + pullback.pullAmount * 0.28)
  }

  if (leftBand) {
    updateSegmentMesh(leftBand, leftFork, pouchPosition.clone().add(new THREE.Vector3(-0.11, 0, 0)))
  }

  if (rightBand) {
    updateSegmentMesh(rightBand, rightFork, pouchPosition.clone().add(new THREE.Vector3(0.11, 0, 0)))
  }
}

function createCylinderBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 16), material)
  updateSegmentMesh(mesh, start, end)
  return mesh
}

function updateSegmentMesh(mesh: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3): void {
  const direction = end.clone().sub(start)
  const length = direction.length()
  const midpoint = start.clone().add(end).multiplyScalar(0.5)
  mesh.position.copy(midpoint)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
  mesh.scale.set(1, length, 1)
}

// Bearded throwing axe. The handle runs along +y with the head at the top and
// the cutting edge facing +x; applyAxeOrientation relies on that edge axis.
function createAxeMesh(): THREE.Group {
  const group = new THREE.Group()
  const wood = new THREE.MeshStandardMaterial({ color: 0x77451f, roughness: 0.55, metalness: 0.02 })
  const wrapMaterial = new THREE.MeshStandardMaterial({ color: 0x2e1c12, roughness: 0.7 })
  const steel = new THREE.MeshStandardMaterial({ color: 0xe2e9ec, metalness: 0.75, roughness: 0.2 })
  const darkSteel = new THREE.MeshStandardMaterial({ color: 0x424e55, metalness: 0.55, roughness: 0.4 })

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.98, 18), wood)
  handle.position.y = -0.11
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.047, 0.22, 18), wrapMaterial)
  wrap.position.y = -0.45
  const butt = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 12), wrapMaterial)
  butt.position.y = -0.62
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.17, 14), darkSteel)
  socket.position.y = 0.34
  const poll = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.07), darkSteel)
  poll.position.set(-0.08, 0.34, 0)

  const bladeProfile = new THREE.Shape()
  bladeProfile.moveTo(0.02, 0.07)
  bladeProfile.lineTo(0.2, 0.13)
  bladeProfile.lineTo(0.3, 0.12)
  bladeProfile.quadraticCurveTo(0.345, -0.02, 0.3, -0.14)
  bladeProfile.quadraticCurveTo(0.28, -0.2, 0.17, -0.24)
  bladeProfile.lineTo(0.04, -0.09)
  bladeProfile.lineTo(0.02, -0.07)
  bladeProfile.closePath()
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(bladeProfile, {
      depth: 0.048,
      bevelEnabled: true,
      bevelThickness: 0.006,
      bevelSize: 0.006,
      bevelSegments: 1,
    }),
    darkSteel,
  )
  blade.position.set(0, 0.34, -0.03)

  const edgeProfile = new THREE.Shape()
  edgeProfile.moveTo(0.24, 0.105)
  edgeProfile.lineTo(0.3, 0.12)
  edgeProfile.quadraticCurveTo(0.345, -0.02, 0.3, -0.14)
  edgeProfile.quadraticCurveTo(0.28, -0.2, 0.17, -0.24)
  edgeProfile.lineTo(0.15, -0.185)
  edgeProfile.quadraticCurveTo(0.27, -0.04, 0.24, 0.105)
  edgeProfile.closePath()
  const edge = new THREE.Mesh(
    new THREE.ExtrudeGeometry(edgeProfile, { depth: 0.068, bevelEnabled: false }),
    steel,
  )
  edge.position.set(0, 0.34, -0.034)

  group.add(handle, wrap, butt, socket, poll, blade, edge)
  return group
}

function createScorchMark(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CircleGeometry(0.16, 28),
    new THREE.MeshBasicMaterial({ color: 0x231815, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
  )
}

function createDentMark(): THREE.Group {
  const group = new THREE.Group()
  const dent = new THREE.Mesh(
    new THREE.CircleGeometry(0.1, 24),
    new THREE.MeshBasicMaterial({ color: 0x59666a, transparent: true, opacity: 0.72, side: THREE.DoubleSide }),
  )
  const rim = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.13, 24),
    new THREE.MeshBasicMaterial({ color: 0x2f3d42, transparent: true, opacity: 0.44, side: THREE.DoubleSide }),
  )
  group.add(dent, rim)
  return group
}

function createTailFin(angle: number, material: THREE.Material): THREE.Mesh {
  const radial = new THREE.Vector2(Math.cos(angle), Math.sin(angle))
  const tangent = new THREE.Vector2(-Math.sin(angle), Math.cos(angle))
  const rootRadius = 0.018
  const outerRadius = 0.17
  const rootHalfWidth = 0.012
  const outerHalfWidth = 0.04
  const zStart = 0.28
  const zEnd = 0.66
  const positions = [
    radial.x * rootRadius + tangent.x * rootHalfWidth,
    radial.y * rootRadius + tangent.y * rootHalfWidth,
    zStart,
    radial.x * rootRadius - tangent.x * rootHalfWidth,
    radial.y * rootRadius - tangent.y * rootHalfWidth,
    zStart,
    radial.x * outerRadius - tangent.x * outerHalfWidth,
    radial.y * outerRadius - tangent.y * outerHalfWidth,
    zEnd,
    radial.x * outerRadius + tangent.x * outerHalfWidth,
    radial.y * outerRadius + tangent.y * outerHalfWidth,
    zEnd,
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3])
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, material)
}

function vectorLike(vector: THREE.Vector3): Vec3Like {
  return { x: vector.x, y: vector.y, z: vector.z }
}
