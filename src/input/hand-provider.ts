import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { createHandFrameFromLandmarks, type AimAnchor, type HandFrame, type HandLandmark } from './gesture'
import { getGameVariantConfig } from '../variants/config'
import type { VariantId } from '../variants/registry'

export type HandProviderStatus = 'idle' | 'requesting-camera' | 'loading-model' | 'ready' | 'tracking' | 'error'

export interface HandInputProvider {
  readonly status: HandProviderStatus
  readonly statusMessage: string
  start(): Promise<void>
  getFrame(timestamp: number): HandFrame | null
  stop(): void
}

const wasmPath = '/mediapipe/wasm'
const modelPath = '/mediapipe/models/hand_landmarker.task'

export class MediaPipeHandInputProvider implements HandInputProvider {
  private video: HTMLVideoElement
  private stream: MediaStream | null = null
  private landmarker: HandLandmarker | null = null
  private lastVideoTime = -1
  private currentFrame: HandFrame | null = null
  private readonly aimAnchor: AimAnchor
  private readonly aimScale: number
  status: HandProviderStatus = 'idle'
  statusMessage = 'Camera idle'

  constructor(aimAnchor: AimAnchor = 'pinch', aimScale = 1) {
    this.aimAnchor = aimAnchor
    this.aimScale = aimScale
    this.video = document.createElement('video')
    this.video.playsInline = true
    this.video.muted = true
    this.video.autoplay = true
    this.video.style.display = 'none'
    this.video.setAttribute('aria-hidden', 'true')
    document.body.append(this.video)
  }

  async start(): Promise<void> {
    try {
      this.status = 'requesting-camera'
      this.statusMessage = 'Requesting camera access'
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      this.video.srcObject = this.stream
      await this.video.play()

      this.status = 'loading-model'
      this.statusMessage = 'Loading hand tracker'
      const vision = await FilesetResolver.forVisionTasks(wasmPath)
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelPath,
        },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      })

      this.status = 'ready'
      this.statusMessage = 'Show your hand to aim'
    } catch (error) {
      this.status = 'error'
      this.statusMessage = error instanceof Error ? error.message : 'Camera setup failed'
      throw error
    }
  }

  getFrame(timestamp: number): HandFrame | null {
    if (!this.landmarker || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return this.currentFrame
    }

    if (this.video.currentTime === this.lastVideoTime) {
      return this.currentFrame
    }

    this.lastVideoTime = this.video.currentTime
    const result = this.landmarker.detectForVideo(this.video, timestamp)
    this.currentFrame = this.frameFromResult(result, timestamp)

    if (this.currentFrame) {
      this.status = 'tracking'
      this.statusMessage = this.currentFrame.pinchRatio < 0.42 ? 'Pinch held' : 'Tracking hand'
    } else {
      this.status = 'ready'
      this.statusMessage = 'Show your hand to aim'
    }

    return this.currentFrame
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    this.landmarker?.close()
    this.landmarker = null
    this.currentFrame = null
    this.status = 'idle'
    this.statusMessage = 'Camera idle'
  }

  private frameFromResult(result: HandLandmarkerResult, timestamp: number): HandFrame | null {
    const landmarks = result.landmarks[0] as HandLandmark[] | undefined

    if (!landmarks) {
      return null
    }

    const categoryName = result.handedness[0]?.[0]?.categoryName
    const handedness = categoryName === 'Left' || categoryName === 'Right' ? categoryName : undefined
    const confidence = result.handedness[0]?.[0]?.score ?? 1

    return createHandFrameFromLandmarks(landmarks, timestamp, confidence, handedness, this.aimAnchor, this.aimScale)
  }
}

export class SyntheticHandInputProvider implements HandInputProvider {
  status: HandProviderStatus = 'idle'
  statusMessage = 'Synthetic hand tracker idle'
  private startedAt: number | null = null
  private readonly variantId: VariantId

  constructor(variantId: VariantId = 'darts') {
    this.variantId = variantId
  }

  async start(): Promise<void> {
    this.status = 'tracking'
    this.statusMessage = 'Synthetic throw armed'
    this.startedAt = null
  }

  getFrame(timestamp: number): HandFrame | null {
    if (this.startedAt === null) {
      this.startedAt = timestamp
    }

    const elapsed = timestamp - this.startedAt
    const cycleDuration = 1900
    const cycle = elapsed % cycleDuration
    const throwIndex = Math.floor(elapsed / cycleDuration)
    const aims = [
      { x: 0.1, y: -0.05 },
      { x: -0.28, y: 0.18 },
      { x: 0.02, y: 0.02 },
    ]
    const aim = aims[Math.min(throwIndex, aims.length - 1)]

    return this.frameForVariant(timestamp, cycle, aim)
  }

  stop(): void {
    this.status = 'idle'
    this.statusMessage = 'Synthetic hand tracker idle'
    this.startedAt = null
  }
  private frameForVariant(timestamp: number, cycle: number, aim: { x: number; y: number }): HandFrame {
    const release = cycle >= 680 && cycle < 1080
    const pushing = cycle >= 260 && cycle < 680
    const forwardDepth = pushing || release ? Math.min(0.68, 0.16 + Math.max(0, cycle - 260) * 0.0012) : 0.16
    const baseFrame = {
      timestamp,
      aimX: aim.x,
      aimY: aim.y,
      trackingConfidence: 1,
      handedness: 'Right' as const,
    }

    switch (this.variantId) {
      case 'wizard-spells': {
        const wizardRelease = cycle >= 840 && cycle < 1240
        const wizardPushing = cycle >= 260 && cycle < 840
        return {
          ...baseFrame,
          depth: wizardPushing || wizardRelease ? Math.min(0.72, 0.16 + Math.max(0, cycle - 260) * 0.0022) : 0.16,
          pinchRatio: 0.8,
          handShape: 'fist',
          fingerDirection: 'across-screen',
          thumbDirection: wizardRelease ? 'toward-screen' : 'away-from-screen',
          wandTargetTilt: Math.min(1, -1 + Math.min(1, Math.max(0, cycle - 260) / 560) * 2.4),
        }
      }
      case 'axe-throw':
        return {
          ...baseFrame,
          depth: forwardDepth,
          pinchRatio: 0.8,
          handShape: release ? 'open' : 'fist',
          fingerDirection: release ? 'toward-screen' : 'across-screen',
        }
      case 'basketball':
        return {
          ...baseFrame,
          depth: forwardDepth,
          pinchRatio: 0.8,
          handShape: 'open',
          palmOrientation: release ? 'down' : 'up',
          fingerDirection: release ? 'toward-screen' : 'away-from-screen',
      }
      case 'slingshot': {
        const slingshotRelease = cycle >= 980 && cycle < 1320
        const pullback = cycle >= 260 && cycle < 980
        const depth = pullback || slingshotRelease ? Math.max(0.18, 0.58 - Math.max(0, cycle - 260) * 0.001) : 0.58
        return {
          ...baseFrame,
          depth,
          pinchRatio: slingshotRelease ? 0.58 : 0.35,
          handShape: slingshotRelease ? 'open' : 'pinched',
          fingerDirection: 'away-from-screen',
        }
      }
      case 'darts':
        return {
          ...baseFrame,
          depth: forwardDepth,
          pinchRatio: release ? 0.58 : 0.35,
          handShape: release ? 'open' : 'pinched',
          fingerDirection: release ? 'toward-screen' : 'across-screen',
        }
    }
  }
}

export function createDefaultHandProvider(variantId: VariantId = 'darts'): HandInputProvider {
  const params = new URLSearchParams(window.location.search)
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)

  if (isLocalHost && params.get('testInput') === 'synthetic') {
    return new SyntheticHandInputProvider(variantId)
  }

  const variant = getGameVariantConfig(variantId)
  return new MediaPipeHandInputProvider(variant.aimAnchor, variant.aimScale)
}
