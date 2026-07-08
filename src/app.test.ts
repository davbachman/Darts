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
    expect(root.textContent).not.toContain('Basketball')
    expect(root.textContent).not.toContain('Wizard Spells')
    expect(root.textContent).not.toContain('Slingshot')
    expect(root.textContent).not.toContain('Axe Throw')
  })
})
