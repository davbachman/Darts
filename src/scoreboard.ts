import {
  cricketTargets,
  targetLabel,
  type CricketTarget,
  type DartsModeState,
  type DartsPlayerState,
} from './game/dart-modes'
import { formatDartHit } from './game/scoring'

export function renderPubScoreboard(mode: DartsModeState): string {
  if (mode.mode === 'cricket') {
    return renderCricketScoreboard(mode)
  }

  if (mode.mode === '301') {
    return renderCountdownScoreboard(mode)
  }

  if (mode.mode === 'around-the-clock') {
    return renderClockScoreboard(mode)
  }

  return renderPracticeScoreboard(mode)
}

export function renderTurnSlots(mode: DartsModeState): string {
  return Array.from({ length: 3 }, (_, index) => {
    const dartThrow = mode.currentTurn[index]
    const label = dartThrow ? formatDartHit(dartThrow) : ''
    return `<span class="turn-slot ${dartThrow ? 'filled' : 'empty'}">${label || '-'}</span>`
  }).join('')
}

export function renderCricketMark(count: number): string {
  const marks = Math.max(0, Math.min(3, count))
  return `
    <span class="chalk-cricket-mark mark-${marks}" aria-label="${marks} marks">
      ${marks >= 1 ? '<span class="mark-line mark-forward"></span>' : ''}
      ${marks >= 2 ? '<span class="mark-line mark-back"></span>' : ''}
      ${marks >= 3 ? '<span class="mark-ring"></span>' : ''}
    </span>
  `
}

function renderCricketScoreboard(mode: DartsModeState): string {
  const [first, second] = mode.players

  return `
    <section class="pub-score-sheet cricket-score-sheet" aria-label="Cricket score sheet">
      ${renderNamesLine(mode.players, 'VS')}
      <div class="pub-title-line">
        <span>${first?.score ?? 0}</span>
        <strong>01 CRICKET</strong>
        <span>${second?.score ?? 0}</span>
      </div>
      <div class="cricket-ledger">
        <div class="cricket-mark-column">
          ${cricketTargets.map((target) => renderCricketMark(first?.cricket.marks[target] ?? 0)).join('')}
        </div>
        <div class="cricket-target-column">
          ${cricketTargets.map((target) => `<strong>${cricketTargetLabel(target)}</strong>`).join('')}
        </div>
        <div class="cricket-mark-column">
          ${cricketTargets.map((target) => renderCricketMark(second?.cricket.marks[target] ?? 0)).join('')}
        </div>
      </div>
      ${renderLastEvent(mode)}
    </section>
  `
}

function renderCountdownScoreboard(mode: DartsModeState): string {
  return `
    <section class="pub-score-sheet countdown-score-sheet" aria-label="301 score sheet">
      ${renderNamesLine(mode.players, '301')}
      <div class="pub-score-columns">
        ${mode.players.map((player, index) => renderPlayerColumn(player, index, mode, String(player.remaining ?? 301), 'Remaining')).join('')}
      </div>
      ${renderLastEvent(mode)}
    </section>
  `
}

function renderClockScoreboard(mode: DartsModeState): string {
  return `
    <section class="pub-score-sheet clock-score-sheet" aria-label="Around the Clock score sheet">
      ${renderNamesLine(mode.players, 'AROUND THE CLOCK')}
      <div class="pub-score-columns">
        ${mode.players.map((player, index) => renderPlayerColumn(player, index, mode, targetLabel(player.clockTarget), 'Current target')).join('')}
      </div>
      ${renderLastEvent(mode)}
    </section>
  `
}

function renderPracticeScoreboard(mode: DartsModeState): string {
  const player = mode.players[0]

  return `
    <section class="pub-score-sheet practice-score-sheet" aria-label="Practice score sheet">
      ${renderNamesLine(mode.players, 'PRACTICE')}
      <div class="practice-total">
        <span>Total</span>
        <strong>${player?.score ?? 0}</strong>
      </div>
      ${renderLastEvent(mode)}
    </section>
  `
}

function renderNamesLine(players: DartsPlayerState[], center: string): string {
  const first = players[0]?.name ?? 'Player 1'
  const second = players[1]?.name ?? ''
  return `
    <div class="pub-names-line">
      <span>${escapeHtml(first)}</span>
      <strong>${escapeHtml(center)}</strong>
      <span>${escapeHtml(second)}</span>
    </div>
  `
}

function renderPlayerColumn(
  player: DartsPlayerState,
  index: number,
  mode: DartsModeState,
  value: string,
  label: string,
): string {
  const active = index === mode.activePlayer && mode.status === 'active'
  return `
    <div class="pub-score-column ${active ? 'active' : ''}">
      <span class="pub-player-name">${escapeHtml(player.name)}</span>
      <strong>${escapeHtml(value)}</strong>
      <span>${label}</span>
    </div>
  `
}

function renderLastEvent(mode: DartsModeState): string {
  return mode.lastEvent ? `<p class="chalk-note">${escapeHtml(mode.lastEvent)}</p>` : ''
}

function cricketTargetLabel(target: CricketTarget): string {
  return target === 'bull' ? 'BULL' : String(target)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
