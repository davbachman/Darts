// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { HandThrowApp } from './app'

describe('Darts app shell', () => {
  it('renders the Darts mode menu as the first screen', () => {
    const root = document.createElement('div')

    new HandThrowApp(root)

    expect(document.title).toBe('Darts')
    expect(root.querySelector('h1')?.textContent).toBe('Darts')
    expect([...root.querySelectorAll<HTMLButtonElement>('.mode-card button')].map((button) => button.textContent)).toEqual([
      'Practice',
      '301',
      'Cricket',
      'Around the Clock',
    ])
    const legacyLabels = ['Basket' + 'ball', 'Wiz' + 'ard Spells', 'Sling' + 'shot', 'A' + 'xe Throw']
    legacyLabels.forEach((label) => expect(root.textContent).not.toContain(label))
  })
})
