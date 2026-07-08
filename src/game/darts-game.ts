import * as THREE from 'three'
import { createDartRound, recordDartThrow, resetDartRound, type DartRoundState } from './dart-round'
import { applyDartToMode, createDartsModeState, type DartsGameMode, type DartsModeState } from './dart-modes'
import { applyDartLookAt, computeReadyDartRotation } from './dart-orientation'
import { computeDartFlightPoint, computeFlightDurationMs, type Vec3Like } from './flight'
import { dartboardNumbers, formatDartScore, scoreDartImpact } from './scoring'
import { GameSounds } from './sound'
import { type HandInputProvider } from '../input/hand-provider'
import { ThrowGestureTracker, type ThrowInputSnapshot } from '../input/gesture'

interface ActiveFlight {
  start: THREE.Vector3
  end: THREE.Vector3
  velocity: number
  elapsedMs: number
  durationMs: number
  impact: { x: number; y: number }
  mesh: THREE.Group
  recorded: boolean
}

export interface DartsGameTextState {
  mode: 'darts'
  coordinateSystem: string
  providerStatus: string
  providerMessage: string
  gestureState: ThrowInputSnapshot['state']
  aim: { x: number; y: number }
  depth: number
  round: DartRoundState
  dartsMode: DartsModeState
  activeFlight: null | {
    progress: number
    impact: { x: number; y: number }
  }
  stuckObjects: number
  impactMarks: number
}

const boardZ = -7
const boardCenterY = 2
const readyZ = 2.2
const boardScale = 1.55
export const dartboardVisualScale = boardScale

export class DartsGame {
  private readonly host: HTMLElement
  private readonly provider: HandInputProvider
  private readonly tracker = new ThrowGestureTracker()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  private readonly renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  })
  private readonly readyDart = createDartMesh()
  private readonly sounds = new GameSounds()
  private readonly landedObjects: THREE.Group[] = []
  private readonly impactMarks: THREE.Object3D[] = []
  private round = createDartRound()
  private dartsMode: DartsModeState
  private lastGesture: ThrowInputSnapshot = { state: 'idle', aim: { x: 0, y: 0 }, depth: 0 }
  private activeFlight: ActiveFlight | null = null
  private started = false

  constructor(
    host: HTMLElement,
    provider: HandInputProvider,
    dartsMode: DartsGameMode = 'practice',
  ) {
    this.host = host
    this.provider = provider
    this.dartsMode = createDartsModeState(dartsMode)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.domElement.id = 'game-canvas'
    this.renderer.domElement.setAttribute('aria-label', 'Darts throwing scene')
    this.host.append(this.renderer.domElement)
    this.scene.background = new THREE.Color(0x1b120d)
    this.camera.position.set(0, 0.1, 6)
    this.camera.lookAt(0, 0, boardZ)

    this.loadPubBackground()
    this.setupLights()
    this.setupRange()
    this.readyDart.visible = shouldShowReadyDart(false)
    this.readyDart.position.copy(readyDartPosition({ x: 0, y: 0 }))
    applyReadyDartRotation(this.readyDart, { x: 0, y: 0 })
    this.scene.add(this.readyDart)
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
      this.updateReadyDart()

      if (this.lastGesture.release) {
        this.launchDart(this.lastGesture.release.aim, this.lastGesture.release.velocity)
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
      mode: 'darts',
      coordinateSystem: 'aim x/y are normalized board coordinates; origin is board center; +x right, +y up',
      providerStatus: this.provider.status,
      providerMessage: this.lastGesture.state === 'pinched' ? 'Pinch held' : this.provider.statusMessage,
      gestureState: this.lastGesture.state,
      aim: this.lastGesture.aim,
      depth: this.lastGesture.depth,
      round: this.round,
      dartsMode: this.dartsMode,
      activeFlight: this.activeFlight
        ? {
            progress: Math.min(1, this.activeFlight.elapsedMs / this.activeFlight.durationMs),
            impact: this.activeFlight.impact,
          }
        : null,
      stuckObjects: this.landedObjects.length,
      impactMarks: this.impactMarks.length,
    }
  }

  private setupLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xfff6e6, 0x4b3628, 1.8))
    const key = new THREE.DirectionalLight(0xfff3d2, 2.3)
    key.position.set(-3, 5, 5)
    this.scene.add(key)
    const rim = new THREE.DirectionalLight(0xf0b45f, 1.1)
    rim.position.set(4, 3, -3)
    this.scene.add(rim)
  }

  private loadPubBackground(): void {
    new THREE.TextureLoader().load('/assets/pub-dart-lane.png', (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      this.scene.background = texture
      this.render()
    })
  }

  private setupRange(): void {
    this.scene.add(createDartboard())
  }

  private updateReadyDart(): void {
    const isHeld = this.lastGesture.state === 'pinched'
    this.readyDart.visible = shouldShowReadyDart(isHeld)

    if (!this.readyDart.visible) {
      return
    }

    this.readyDart.position.copy(readyDartPosition(this.lastGesture.aim))
    applyReadyDartRotation(this.readyDart, this.lastGesture.aim)
  }

  private launchDart(aim: { x: number; y: number }, velocity: number): void {
    const start = readyDartPosition(aim)
    const end = new THREE.Vector3(aim.x * boardScale, boardCenterY + aim.y * boardScale, boardZ + 0.14)
    const mesh = createDartMesh()
    mesh.position.copy(start)
    this.scene.add(mesh)
    this.sounds.playLaunch(velocity)
    this.readyDart.visible = false
    this.activeFlight = {
      start,
      end,
      velocity,
      elapsedMs: 0,
      durationMs: computeFlightDurationMs(velocity),
      impact: { x: aim.x, y: aim.y },
      mesh,
      recorded: false,
    }
  }

  private updateFlight(deltaMs: number): void {
    if (!this.activeFlight) {
      return
    }

    this.activeFlight.elapsedMs += deltaMs
    const progress = Math.min(1, this.activeFlight.elapsedMs / this.activeFlight.durationMs)
    const position = computeDartFlightPoint(
      vectorLike(this.activeFlight.start),
      vectorLike(this.activeFlight.end),
      progress,
      this.activeFlight.velocity,
    )

    this.activeFlight.mesh.position.set(position.x, position.y, position.z)
    applyDartLookAt(this.activeFlight.mesh, this.activeFlight.end)

    if (progress >= 1) {
      this.finishFlight()
    }
  }

  private finishFlight(): void {
    if (!this.activeFlight) {
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
      this.sounds.playImpact('stick', score.points)
      this.spawnImpactPopup(
        score.points > 0 ? formatDartScore(score) : 'Miss',
        score.points > 0 ? 'score' : 'miss',
        landed.end,
      )
    }

    this.landedObjects.push(landed.mesh)
    landed.mesh.position.copy(landed.end)
    applyDartLookAt(landed.mesh, new THREE.Vector3(landed.end.x, landed.end.y, landed.end.z - 1))

    if (clearLandedObjectsAfterTurn) {
      this.clearLandedObjects()
    }

    this.activeFlight = null
    this.tracker.reset()
  }

  private clearLandedObjects(): void {
    this.landedObjects.splice(0).forEach((object) => object.removeFromParent())
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

export function readyDartPosition(aim: { x: number; y: number }): THREE.Vector3 {
  return new THREE.Vector3(aim.x * 1.15, aim.y * 0.82, readyZ)
}

export function shouldShowReadyDart(isHeld: boolean): boolean {
  return isHeld
}

export function shouldClearLandedObjectsAfterTurn(previous: DartsModeState, next: DartsModeState): boolean {
  return previous.activePlayer !== next.activePlayer
}

function applyReadyDartRotation(object: THREE.Group, aim: { x: number; y: number }): void {
  const rotation = computeReadyDartRotation(aim)
  object.rotation.set(rotation.x, rotation.y, rotation.z)
}

function createDartboard(): THREE.Group {
  const board = new THREE.Group()
  board.position.set(0, boardCenterY, boardZ)
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
    const separator = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.86, 0.01), wire)
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
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 20), shaftMaterial)
  shaft.rotation.x = Math.PI / 2
  shaft.position.z = 0.2
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.34, 24), brass)
  barrel.rotation.x = Math.PI / 2
  barrel.position.z = -0.28
  const gripA = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.004, 8, 24), metal)
  gripA.position.z = -0.38
  const gripB = gripA.clone()
  gripB.position.z = -0.22
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.24, 24), metal)
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
