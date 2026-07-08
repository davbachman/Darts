import type { FlightPathStyle } from '../game/flight'
import type { AimAnchor, ThrowGestureKind } from '../input/gesture'
import type { VariantId } from './registry'

export type ProjectileKind = 'dart' | 'fireball' | 'basketball' | 'marble' | 'axe'
export type TargetKind = 'board' | 'hoop'
export type ImpactBehavior = 'stick' | 'scorch' | 'dent' | 'basketball'

export interface GameVariantConfig {
  id: VariantId
  label: string
  hudTitle: string
  gestureKind: ThrowGestureKind
  heldState: 'pinched' | 'held'
  holdMessage: string
  instructions: string
  aimAnchor: AimAnchor
  aimScale?: number
  projectile: ProjectileKind
  flightPath: FlightPathStyle
  target: TargetKind
  impact: ImpactBehavior
}

export const gameVariantConfigs: Record<VariantId, GameVariantConfig> = {
  darts: {
    id: 'darts',
    label: 'Darts',
    hudTitle: 'Round',
    gestureKind: 'pinch-push',
    heldState: 'pinched',
    holdMessage: 'Pinch held',
    instructions: 'Pinch thumb and index to grab a dart, push toward the screen, then unpinch to throw.',
    aimAnchor: 'pinch',
    aimScale: 2,
    projectile: 'dart',
    flightPath: 'low-arc',
    target: 'board',
    impact: 'stick',
  },
  'wizard-spells': {
    id: 'wizard-spells',
    label: 'Wizard Spells',
    hudTitle: 'Spells',
    gestureKind: 'thumb-wand-flick',
    heldState: 'held',
    holdMessage: 'Wand ready',
    instructions: 'Make a fist to ready the wand, then flick your thumb toward the screen to cast.',
    aimAnchor: 'fist',
    projectile: 'fireball',
    flightPath: 'straight',
    target: 'board',
    impact: 'scorch',
  },
  basketball: {
    id: 'basketball',
    label: 'Basketball',
    hudTitle: 'Shots',
    gestureKind: 'palm-turn-shot',
    heldState: 'held',
    holdMessage: 'Ball held',
    instructions: 'Show an open hand to hold the ball, then push your hand toward the screen to shoot.',
    aimAnchor: 'ring-finger',
    projectile: 'basketball',
    flightPath: 'tall-arc',
    target: 'hoop',
    impact: 'basketball',
  },
  slingshot: {
    id: 'slingshot',
    label: 'Slingshot',
    hudTitle: 'Marbles',
    gestureKind: 'pinch-pull-release',
    heldState: 'pinched',
    holdMessage: 'Marble pinched',
    instructions: 'Pinch the marble, pull your hand back away from the screen, then unpinch to fire.',
    aimAnchor: 'pinch',
    projectile: 'marble',
    flightPath: 'low-arc',
    target: 'board',
    impact: 'dent',
  },
  'axe-throw': {
    id: 'axe-throw',
    label: 'Axe Throw',
    hudTitle: 'Axes',
    gestureKind: 'fist-open-point',
    heldState: 'held',
    holdMessage: 'Axe held',
    instructions: 'Make a fist to hold the axe, then snap your hand open toward the screen to throw.',
    aimAnchor: 'fist',
    projectile: 'axe',
    flightPath: 'low-arc',
    target: 'board',
    impact: 'stick',
  },
}

export function getGameVariantConfig(id: VariantId): GameVariantConfig {
  return gameVariantConfigs[id]
}
