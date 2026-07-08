import { DartsGame } from './game/darts-game'
import { cricketTargets, dartsGameModes, targetLabel, type DartsGameMode } from './game/dart-modes'
import { formatDartHit } from './game/scoring'
import { createDefaultHandProvider } from './input/hand-provider'

type ScreenMode = 'menu' | 'darts'

const dartsInstructions = 'Pinch thumb and index to grab a dart, push toward the screen, then unpinch to throw.'

export class HandThrowApp {
  private readonly root: HTMLElement
  private mode: ScreenMode = 'menu'
  private game: DartsGame | null = null
  private lastTimestamp = 0
  private running = false
  private hudScore: HTMLElement | null = null
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
        <aside class="hud-panel" aria-label="Darts score">
          <div>
            <p class="eyebrow">Darts</p>
            <h1>${modeLabel}</h1>
          </div>
          <div class="hud-stat">
            <span>Score</span>
            <strong id="hud-score">0</strong>
          </div>
          <div class="hud-mode-details" id="hud-mode-details"></div>
          <div class="throw-slots" id="hud-throws" aria-label="Throw slots"></div>
          <p class="hud-status" id="hud-status">Starting camera</p>
          <p class="hud-help">${dartsInstructions}</p>
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

    if (this.hudScore) {
      this.hudScore.textContent = state.dartsMode ? this.primaryScore(state.dartsMode) : String(state.round.totalScore)
    }

    if (this.hudStatus) {
      this.hudStatus.textContent = state.providerMessage
    }

    if (this.hudThrows) {
      const throws = state.dartsMode?.currentTurn ?? state.round.throws.map((dartThrow) => dartThrow.score)
      this.hudThrows.innerHTML = Array.from({ length: state.round.maxThrows }, (_, index) => {
        const dartThrow = throws[index]
        return `<span class="${dartThrow ? 'filled' : ''}">${dartThrow ? formatDartHit(dartThrow) : '-'}</span>`
      }).join('')
    }

    if (this.hudModeDetails && state.dartsMode) {
      this.hudModeDetails.innerHTML = this.modeDetails(state.dartsMode)
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

  private modeDetails(mode: NonNullable<ReturnType<DartsGame['getTextState']>['dartsMode']>): string {
    if (mode.mode === 'cricket') {
      const rows = cricketTargets
        .map((target) => {
          const label = target === 'bull' ? 'B' : String(target)
          const playerMarks = mode.players
            .map((player) => `<span>${this.cricketMarks(player.cricket.marks[target])}</span>`)
            .join('')
          return `<div class="cricket-row"><strong>${label}</strong>${playerMarks}</div>`
        })
        .join('')
      const scores = mode.players
        .map((player, index) => `<div class="${index === mode.activePlayer && mode.status === 'active' ? 'active' : ''}"><span>${player.name}</span><strong>${player.score}</strong></div>`)
        .join('')

      return `
        <div class="cricket-board">
          <div class="cricket-row cricket-head"><strong></strong><span>P1</span><span>P2</span></div>
          ${rows}
        </div>
        <div class="player-scoreboard">${scores}</div>
        ${mode.lastEvent ? `<p>${mode.lastEvent}</p>` : ''}
      `
    }

    const players = mode.players
      .map((player, index) => {
        const active = index === mode.activePlayer && mode.status === 'active'
        const value =
          mode.mode === '301'
            ? player.remaining
            : mode.mode === 'around-the-clock'
              ? targetLabel(player.clockTarget)
              : player.score
        return `<div class="${active ? 'active' : ''}"><span>${player.name}</span><strong>${value}</strong></div>`
      })
      .join('')

    return `<div class="player-scoreboard">${players}</div>${mode.lastEvent ? `<p>${mode.lastEvent}</p>` : ''}`
  }

  private cricketMarks(count: number): string {
    if (count >= 3) {
      return 'X'
    }

    if (count === 2) {
      return '/'
    }

    if (count === 1) {
      return '-'
    }

    return ''
  }

  private primaryScore(mode: NonNullable<ReturnType<DartsGame['getTextState']>['dartsMode']>): string {
    const active = mode.players[mode.activePlayer]

    if (mode.mode === '301') {
      return String(active.remaining)
    }

    if (mode.mode === 'around-the-clock') {
      return targetLabel(active.clockTarget)
    }

    return String(active.score)
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
