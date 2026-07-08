import { DartsGame } from './game/darts-game'
import { dartsGameModes, type DartsGameMode } from './game/dart-modes'
import { createDefaultHandProvider } from './input/hand-provider'
import { renderPubScoreboard, renderTurnSlots } from './scoreboard'

type ScreenMode = 'menu' | 'darts'

export class HandThrowApp {
  private readonly root: HTMLElement
  private mode: ScreenMode = 'menu'
  private game: DartsGame | null = null
  private lastTimestamp = 0
  private running = false
  private hudStatus: HTMLElement | null = null
  private hudThrows: HTMLElement | null = null
  private hudModeDetails: HTMLElement | null = null
  private roundOverlay: HTMLElement | null = null
  private roundOverlayTotal: HTMLElement | null = null

  constructor(root: HTMLElement) {
    this.root = root
    document.title = 'Darts'
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
    return JSON.stringify({
      mode: this.mode,
      dartsModes: dartsGameModes.map(({ id, label, playerCount }) => ({ id, label, playerCount })),
      game: this.game?.getTextState() ?? null,
    })
  }

  private renderMenu(): void {
    this.mode = 'menu'
    this.stopGame()
    this.root.innerHTML = `
      <main class="menu-shell darts-menu-shell">
        <section class="menu-copy">
          <p class="eyebrow">Darts</p>
          <h1>Darts</h1>
          <p class="menu-lede">Choose a darts game, pinch a dart, push toward the screen, and release.</p>
        </section>
        <section class="mode-grid" aria-label="Darts games">
          ${dartsGameModes.map((mode) => this.modeCard(mode)).join('')}
        </section>
      </main>
    `

    dartsGameModes.forEach((mode) => {
      this.root.querySelector<HTMLButtonElement>(`#play-${mode.id}`)?.addEventListener('click', () => {
        void this.startDartsMode(mode.id)
      })
    })
  }

  private modeCard(mode: (typeof dartsGameModes)[number]): string {
    return `
      <article class="mode-card">
        <div>
          <p class="variant-status">${mode.playerCount === 1 ? 'Solo' : 'Two players'}</p>
          <h2>${mode.label}</h2>
          <p>${mode.description}</p>
        </div>
        <button id="play-${mode.id}" class="primary-action" type="button">${mode.label}</button>
      </article>
    `
  }

  private async startDartsMode(dartsMode: DartsGameMode): Promise<void> {
    this.mode = 'darts'
    const modeLabel = dartsGameModes.find((mode) => mode.id === dartsMode)?.label ?? 'Darts'
    this.root.innerHTML = `
      <main class="game-shell">
        <section class="game-stage" id="game-stage">
          <div class="round-overlay" id="round-overlay" hidden>
            <div class="round-overlay-card">
              <p class="eyebrow">Darts</p>
              <h2>Round complete</h2>
              <p class="round-overlay-total" id="round-overlay-total"></p>
              <button id="overlay-replay" class="primary-action" type="button">Play again</button>
            </div>
          </div>
        </section>
        <aside class="hud-panel pub-scoreboard" aria-label="Darts pub chalkboard score">
          <span class="chalk-screw chalk-screw-top-left" aria-hidden="true"></span>
          <span class="chalk-screw chalk-screw-top-right" aria-hidden="true"></span>
          <span class="chalk-screw chalk-screw-bottom-left" aria-hidden="true"></span>
          <span class="chalk-screw chalk-screw-bottom-right" aria-hidden="true"></span>
          <div class="chalk-board-inner">
            <p class="eyebrow">Darts</p>
            <h1>${modeLabel}</h1>
            <div class="hud-mode-details" id="hud-mode-details"></div>
            <div class="turn-ledger">
              <p class="chalk-section-label">This turn</p>
              <div class="throw-slots" id="hud-throws" aria-label="Throw slots"></div>
            </div>
            <p class="hud-status" id="hud-status">Starting camera</p>
            <div class="hud-actions">
              <button id="replay-round" type="button">Replay</button>
              <button id="back-menu" type="button">Menu</button>
            </div>
          </div>
          <span class="chalk-ledge" aria-hidden="true"></span>
        </aside>
      </main>
    `

    this.hudStatus = this.root.querySelector('#hud-status')
    this.hudThrows = this.root.querySelector('#hud-throws')
    this.hudModeDetails = this.root.querySelector('#hud-mode-details')
    this.roundOverlay = this.root.querySelector('#round-overlay')
    this.roundOverlayTotal = this.root.querySelector('#round-overlay-total')
    this.root.querySelector<HTMLButtonElement>('#back-menu')?.addEventListener('click', () => this.renderMenu())
    this.root.querySelector<HTMLButtonElement>('#replay-round')?.addEventListener('click', () => this.game?.resetRound())
    this.root.querySelector<HTMLButtonElement>('#overlay-replay')?.addEventListener('click', () => this.game?.resetRound())

    const stage = this.root.querySelector<HTMLElement>('#game-stage')

    if (!stage) {
      throw new Error('Game stage missing')
    }

    this.game = new DartsGame(stage, createDefaultHandProvider(), dartsMode)
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

    if (this.hudStatus) {
      this.hudStatus.textContent = state.providerMessage
    }

    if (this.hudThrows && state.dartsMode) {
      this.hudThrows.innerHTML = renderTurnSlots(state.dartsMode)
    }

    if (this.hudModeDetails && state.dartsMode) {
      this.hudModeDetails.innerHTML = renderPubScoreboard(state.dartsMode)
    }

    if (this.roundOverlay) {
      const complete = state.dartsMode ? state.dartsMode.status === 'complete' : state.round.status === 'complete'
      this.roundOverlay.hidden = !complete

      if (complete && this.roundOverlayTotal) {
        this.roundOverlayTotal.textContent = state.dartsMode ? this.completionText(state.dartsMode) : `Total ${state.round.totalScore}`
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

  private completionText(mode: NonNullable<ReturnType<DartsGame['getTextState']>['dartsMode']>): string {
    if (mode.winner !== null) {
      return `${mode.players[mode.winner].name} wins`
    }

    if (mode.mode === 'practice') {
      return `Total ${mode.players[0].score}`
    }

    return 'Game complete'
  }
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) {
    await document.exitFullscreen()
    return
  }

  await document.documentElement.requestFullscreen()
}
