import { DartsGame } from './game/darts-game'
import { createDefaultHandProvider } from './input/hand-provider'
import { getMenuVariants, type VariantDefinition } from './variants/registry'
import { getGameVariantConfig } from './variants/config'
import type { VariantId } from './variants/registry'

type ScreenMode = 'menu' | VariantId

export class HandThrowApp {
  private readonly root: HTMLElement
  private mode: ScreenMode = 'menu'
  private game: DartsGame | null = null
  private lastTimestamp = 0
  private running = false
  private hudScore: HTMLElement | null = null
  private hudStatus: HTMLElement | null = null
  private hudThrows: HTMLElement | null = null
  private roundOverlay: HTMLElement | null = null
  private roundOverlayTotal: HTMLElement | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.renderMenu()
    this.installWindowHooks()
    window.addEventListener('resize', () => this.game?.resize())
    window.addEventListener('keydown', (event) => {
      if (event.key.toLowerCase() === 'f') {
        void toggleFullscreen()
      }
    })
  }

  update(deltaMs: number, timestamp: number): void {
    this.game?.update(deltaMs, timestamp)
    this.game?.render()
    this.updateHud()
  }

  getTextState(): string {
    const menuVariants = getMenuVariants()
    return JSON.stringify({
      mode: this.mode,
      variants: menuVariants.map(({ id, label, status }) => ({ id, label, status })),
      game: this.game?.getTextState() ?? null,
    })
  }

  private renderMenu(): void {
    const menuVariants = getMenuVariants()
    this.mode = 'menu'
    this.stopGame()
    this.root.innerHTML = `
      <main class="menu-shell">
        <section class="menu-copy">
          <p class="eyebrow">HandThrow</p>
          <h1>Throw with your hand.</h1>
          <p class="menu-lede">Choose a target game. Each mode uses your webcam hand landmarks for a distinct hold and throw gesture.</p>
        </section>
        <section class="variant-grid" aria-label="Game variants">
          ${menuVariants.map((variant) => this.variantCard(variant)).join('')}
        </section>
      </main>
    `

    menuVariants
      .filter((variant) => variant.status === 'playable')
      .forEach((variant) => {
        this.root.querySelector<HTMLButtonElement>(`#play-${variant.id}`)?.addEventListener('click', () => {
          void this.startVariant(variant.id)
        })
      })
  }

  private variantCard(variant: VariantDefinition): string {
    const playable = variant.status === 'playable'
    const button = playable
      ? `<button id="play-${variant.id}" class="primary-action" type="button">Play</button>`
      : `<button class="locked-action" type="button" disabled>Coming soon</button>`

    return `
      <article class="variant-card ${playable ? 'is-playable' : 'is-locked'}">
        <div>
          <p class="variant-status">${playable ? 'Playable now' : 'Locked'}</p>
          <h2>${variant.label}</h2>
          <p>${variant.description}</p>
        </div>
        ${button}
      </article>
    `
  }

  private async startVariant(variantId: VariantId): Promise<void> {
    const variant = getGameVariantConfig(variantId)
    this.mode = variantId
    this.root.innerHTML = `
      <main class="game-shell">
        <section class="game-stage" id="game-stage">
          <div class="round-overlay" id="round-overlay" hidden>
            <div class="round-overlay-card">
              <p class="eyebrow">${variant.label}</p>
              <h2>Round complete</h2>
              <p class="round-overlay-total" id="round-overlay-total"></p>
              <button id="overlay-replay" class="primary-action" type="button">Play again</button>
            </div>
          </div>
        </section>
        <aside class="hud-panel" aria-label="${variant.label} score">
          <div>
            <p class="eyebrow">${variant.label}</p>
            <h1>${variant.hudTitle}</h1>
          </div>
          <div class="hud-stat">
            <span>Score</span>
            <strong id="hud-score">0</strong>
          </div>
          <div class="throw-slots" id="hud-throws" aria-label="Throw slots"></div>
          <p class="hud-status" id="hud-status">Starting camera</p>
          <p class="hud-help">${variant.instructions}</p>
          <div class="hud-actions">
            <button id="replay-round" type="button">Replay</button>
            <button id="back-menu" type="button">Menu</button>
          </div>
        </aside>
      </main>
    `

    this.hudScore = this.root.querySelector('#hud-score')
    this.hudStatus = this.root.querySelector('#hud-status')
    this.hudThrows = this.root.querySelector('#hud-throws')
    this.roundOverlay = this.root.querySelector('#round-overlay')
    this.roundOverlayTotal = this.root.querySelector('#round-overlay-total')
    this.root.querySelector<HTMLButtonElement>('#back-menu')?.addEventListener('click', () => this.renderMenu())
    this.root.querySelector<HTMLButtonElement>('#replay-round')?.addEventListener('click', () => this.game?.resetRound())
    this.root.querySelector<HTMLButtonElement>('#overlay-replay')?.addEventListener('click', () => this.game?.resetRound())

    const stage = this.root.querySelector<HTMLElement>('#game-stage')

    if (!stage) {
      throw new Error('Game stage missing')
    }

    this.game = new DartsGame(stage, createDefaultHandProvider(variantId), variant)
    this.game.render()

    try {
      await this.game.start()
      this.startLoop()
    } catch {
      this.updateHud()
    }
  }

  private startLoop(): void {
    if (this.running) {
      return
    }

    this.running = true
    this.lastTimestamp = performance.now()
    requestAnimationFrame((timestamp) => this.frame(timestamp))
  }

  private frame(timestamp: number): void {
    if (!this.running) {
      return
    }

    const deltaMs = Math.max(0, Math.min(40, timestamp - this.lastTimestamp))
    this.lastTimestamp = timestamp
    this.update(deltaMs, timestamp)
    requestAnimationFrame((next) => this.frame(next))
  }

  private stopGame(): void {
    this.running = false
    this.game?.dispose()
    this.game = null
  }

  private updateHud(): void {
    const state = this.game?.getTextState()

    if (!state) {
      return
    }

    if (this.hudScore) {
      this.hudScore.textContent = String(state.round.totalScore)
    }

    if (this.hudStatus) {
      this.hudStatus.textContent = state.providerMessage
    }

    if (this.hudThrows) {
      this.hudThrows.innerHTML = Array.from({ length: state.round.maxThrows }, (_, index) => {
        const dartThrow = state.round.throws[index]
        return `<span class="${dartThrow ? 'filled' : ''}">${dartThrow ? dartThrow.score.points : '-'}</span>`
      }).join('')
    }

    if (this.roundOverlay) {
      const complete = state.round.status === 'complete'
      this.roundOverlay.hidden = !complete

      if (complete && this.roundOverlayTotal) {
        this.roundOverlayTotal.textContent = `Total ${state.round.totalScore}`
      }
    }
  }

  private installWindowHooks(): void {
    window.render_game_to_text = () => this.getTextState()
    window.advanceTime = (ms: number) => {
      const steps = Math.max(1, Math.round(ms / (1000 / 60)))
      const stepMs = ms / steps

      for (let index = 0; index < steps; index += 1) {
        this.lastTimestamp += stepMs
        this.update(stepMs, this.lastTimestamp)
      }
    }
  }
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen()
    return
  }

  await document.documentElement.requestFullscreen()
}
