export type VariantId = 'darts' | 'wizard-spells' | 'basketball' | 'slingshot' | 'axe-throw'
export type VariantStatus = 'playable' | 'locked'

export interface VariantDefinition {
  id: VariantId
  label: string
  status: VariantStatus
  description: string
  visibleInMenu?: boolean
}

export const variantRegistry: VariantDefinition[] = [
  {
    id: 'darts',
    label: 'Darts',
    status: 'playable',
    description: 'Pinch, push, and release a dart toward a distant target.',
  },
  {
    id: 'wizard-spells',
    label: 'Wizard Spells',
    status: 'playable',
    description: 'Make a fist to raise the wand, then flick your thumb toward the screen to cast.',
    visibleInMenu: false,
  },
  {
    id: 'basketball',
    label: 'Basketball',
    status: 'playable',
    description: 'Show an open hand, then push it toward the screen to shoot.',
    visibleInMenu: false,
  },
  {
    id: 'slingshot',
    label: 'Slingshot',
    status: 'playable',
    description: 'Pinch a marble, pull back from the screen, then unpinch to release.',
    visibleInMenu: false,
  },
  {
    id: 'axe-throw',
    label: 'Axe Throw',
    status: 'playable',
    description: 'Make a fist to hold an axe, then snap your hand open toward the screen.',
    visibleInMenu: false,
  },
]

export function getPlayableVariants(): VariantDefinition[] {
  return variantRegistry.filter((variant) => variant.status === 'playable')
}

export function getMenuVariants(): VariantDefinition[] {
  return variantRegistry.filter((variant) => variant.visibleInMenu !== false)
}
