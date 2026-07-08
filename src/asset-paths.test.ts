import { describe, expect, it } from 'vitest'
import { publicAssetPath } from './asset-paths'

describe('public asset paths', () => {
  it('prefixes public assets with the Vite base path for GitHub Pages project sites', () => {
    expect(publicAssetPath('assets/pub-dart-lane.png', '/Darts/')).toBe('/Darts/assets/pub-dart-lane.png')
    expect(publicAssetPath('/mediapipe/wasm', '/Darts/')).toBe('/Darts/mediapipe/wasm')
  })

  it('keeps local development paths rooted at slash', () => {
    expect(publicAssetPath('assets/pub-dart-lane.png', '/')).toBe('/assets/pub-dart-lane.png')
  })
})
