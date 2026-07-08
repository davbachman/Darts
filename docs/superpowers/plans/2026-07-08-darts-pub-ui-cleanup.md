# Darts Pub UI Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the app into a darts-only bar darts experience with legacy non-darts code removed, a generated pub background, and chalkboard-style scoring.

**Architecture:** Remove the old variant abstraction and keep a darts-only scene pipeline: app shell -> hand provider -> pinch-push gesture tracker -> darts renderer -> darts mode reducers. Keep standard dartboard scoring and game mode reducers intact, while simplifying renderer, gesture, and provider code to the darts path only. Move visual polish into CSS and a project-bound generated background asset.

**Tech Stack:** TypeScript, Three.js, MediaPipe Tasks Vision, Vite, Vitest, Codex built-in image generation, Playwright web-game verification.

---

## File Structure

- Modify `src/input/gesture.ts`: keep pinch-based aim/depth mapping and pinch-push release tracking; remove non-darts gesture kinds and anchors.
- Modify `src/input/gesture.test.ts`: keep landmark mapping, dart aim scaling, and pinch-push release tests; remove wizard, axe, basketball, and slingshot tests.
- Modify `src/input/hand-provider.ts`: remove variant IDs/config lookup and keep darts-only synthetic/MediaPipe providers.
- Modify `src/game/flight.ts`: keep low-arc dart flight only; remove straight/tall-arc projectile styles.
- Modify `src/game/flight.test.ts`: cover dart low-arc behavior only.
- Modify `src/game/darts-game.ts`: remove non-darts projectile rendering, impact behavior, text-state fields, and helper exports; keep dart mesh, dartboard, flight, scoring, sounds, impact popups, and turn cleanup.
- Modify `src/game/darts-game.test.ts`: keep dartboard scale, turn cleanup, dart ready visibility, and dart ready position tests only.
- Modify `src/app.ts`: remove dependency on `variants/config` and render mode-specific chalkboard details.
- Modify `src/app.test.ts`: assert darts-only menu and absence of legacy labels.
- Delete `src/variants/config.ts`, `src/variants/registry.ts`, `src/variants/registry.test.ts`.
- Delete `src/game/basketball-impact.ts`, `src/game/basketball-impact.test.ts`, `src/game/slingshot-pullback.ts`, `src/game/slingshot-pullback.test.ts`.
- Delete unused scaffold assets under `src/assets/`.
- Modify `src/style.css`: replace clean app styling with pub wall/menu/stage/chalkboard styling.
- Add `public/assets/pub-dart-lane.png`: generated pub dart-lane background.
- Modify `progress.md`: append implementation and verification notes.

## Task 1: Baseline And Cleanup Tests

**Files:**
- Modify: `src/app.test.ts`
- Modify: `src/input/gesture.test.ts`
- Modify: `src/game/darts-game.test.ts`
- Modify: `src/game/flight.test.ts`

- [ ] **Step 1: Run current tests as baseline**

Run:

```bash
npm test
```

Expected: current suite passes before cleanup begins.

- [ ] **Step 2: Write failing darts-only expectations**

Update `src/app.test.ts` to keep the current Darts menu assertion and add explicit legacy text checks:

```ts
expect(root.textContent).not.toMatch(/Basketball|Wizard Spells|Slingshot|Axe Throw/)
```

Update `src/input/gesture.test.ts` to remove non-darts gesture tests and keep these behaviors:

```ts
it('releases when thumb and index separate by a normal relaxed unpinch distance', () => {
  const tracker = new ThrowGestureTracker()
  const held = tracker.update(frame({ timestamp: 0, depth: 0.1, pinchRatio: 0.3 }))
  const released = tracker.update(frame({ timestamp: 180, depth: 0.45, pinchRatio: 0.58 }))

  expect(held.state).toBe('pinched')
  expect(released.release?.velocity).toBeGreaterThan(0)
})
```

Update `src/game/darts-game.test.ts` to remove non-darts helper expectations and keep:

```ts
expect(shouldShowReadyDart(false)).toBe(false)
expect(shouldShowReadyDart(true)).toBe(true)
expect(readyDartPosition({ x: 0.2, y: 0.1 }).z).toBeGreaterThan(0)
```

Update `src/game/flight.test.ts` so it imports only `computeDartFlightPoint` and `computeFlightDurationMs`.

- [ ] **Step 3: Run red tests**

Run:

```bash
npx vitest run src/app.test.ts src/input/gesture.test.ts src/game/darts-game.test.ts src/game/flight.test.ts
```

Expected: FAIL while old exported helper names and old broad gesture/flight types still exist or test imports no longer match.

## Task 2: Remove Variant Registry And Non-Darts Modules

**Files:**
- Delete: `src/variants/config.ts`
- Delete: `src/variants/registry.ts`
- Delete: `src/variants/registry.test.ts`
- Delete: `src/game/basketball-impact.ts`
- Delete: `src/game/basketball-impact.test.ts`
- Delete: `src/game/slingshot-pullback.ts`
- Delete: `src/game/slingshot-pullback.test.ts`
- Delete: `src/assets/hero.png`
- Delete: `src/assets/typescript.svg`
- Delete: `src/assets/vite.svg`

- [ ] **Step 1: Remove files**

Delete the listed files. Do not remove `public/mediapipe`, because darts still uses MediaPipe.

- [ ] **Step 2: Search for stale imports**

Run:

```bash
rg "variants|basketball|wizard|slingshot|axe|fireball|marble|ProjectileKind|TargetKind|ImpactBehavior" src
```

Expected: matches remain only in tests not yet updated or in code that will be cleaned in later tasks.

## Task 3: Simplify Gesture And Hand Provider

**Files:**
- Modify: `src/input/gesture.ts`
- Modify: `src/input/hand-provider.ts`
- Modify: `src/input/gesture.test.ts`

- [ ] **Step 1: Implement darts-only gesture types**

In `src/input/gesture.ts`, reduce exported gesture shape to:

```ts
export type HandShape = 'unknown' | 'pinched' | 'open'
export type FingerDirection = 'unknown' | 'toward-screen' | 'away-from-screen' | 'across-screen'

export interface HandFrame {
  timestamp: number
  aimX: number
  aimY: number
  depth: number
  pinchRatio: number
  trackingConfidence: number
  handedness?: 'Left' | 'Right'
  handShape?: HandShape
  fingerDirection?: FingerDirection
}
```

Keep `createHandFrameFromLandmarks()` with a default dart aim scale of `2`, using the thumb/index midpoint for aim. Keep `ThrowGestureTracker` with pinch enter/release ratios, smoothing, velocity estimation, and a single pinch-push release condition.

- [ ] **Step 2: Implement darts-only provider**

In `src/input/hand-provider.ts`, remove config/variant imports. Use:

```ts
export function createDefaultHandProvider(): HandInputProvider {
  const params = new URLSearchParams(window.location.search)
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)

  if (isLocalHost && params.get('testInput') === 'synthetic') {
    return new SyntheticHandInputProvider()
  }

  return new MediaPipeHandInputProvider()
}
```

`SyntheticHandInputProvider` should emit only dart pinch-push frames with three synthetic aim points.

- [ ] **Step 3: Run targeted tests**

Run:

```bash
npx vitest run src/input/gesture.test.ts
```

Expected: PASS after cleanup.

## Task 4: Simplify Dart Flight And Renderer

**Files:**
- Modify: `src/game/flight.ts`
- Modify: `src/game/darts-game.ts`
- Modify: `src/game/darts-game.test.ts`
- Modify: `src/game/flight.test.ts`

- [ ] **Step 1: Simplify flight helper**

In `src/game/flight.ts`, remove `FlightPathStyle` and `computeProjectileFlightPoint`. Keep:

```ts
export function computeDartFlightPoint(start: Vec3Like, end: Vec3Like, progress: number, velocity: number): Vec3Like
export function computeFlightDurationMs(velocity: number): number
```

The implementation should keep the current low-arc parabolic behavior.

- [ ] **Step 2: Refactor `DartsGame` constructor**

Change `DartsGame` to accept only:

```ts
constructor(
  host: HTMLElement,
  provider: HandInputProvider,
  dartsMode: DartsGameMode = 'practice',
)
```

Remove `GameVariantConfig`, `VariantId`, projectile kinds, non-darts targets, and non-darts text-state fields.

- [ ] **Step 3: Keep dart-only launch and impact**

Replace `launchProjectile()` with a dart-specific `launchDart()` that:

```ts
const start = readyDartPosition(aim)
const end = new THREE.Vector3(aim.x * boardScale, aim.y * boardScale, boardZ + 0.14)
const mesh = createDartMesh()
```

Use `computeDartFlightPoint()` in `updateFlight()`. In `finishFlightPhase()`, always score with `scoreDartImpact()`, apply the selected darts mode, play dart impact sound, spawn `formatDartScore(score)` or `Miss`, stick the dart mesh, and clear landed darts after a player turn advances.

- [ ] **Step 4: Export dart-only helpers for tests**

Export:

```ts
export function readyDartPosition(aim: { x: number; y: number }): THREE.Vector3
export function shouldShowReadyDart(isHeld: boolean): boolean
export const dartboardVisualScale = boardScale
```

- [ ] **Step 5: Run targeted renderer/flight tests**

Run:

```bash
npx vitest run src/game/darts-game.test.ts src/game/flight.test.ts
```

Expected: PASS.

## Task 5: App Shell And Chalkboard Score Markup

**Files:**
- Modify: `src/app.ts`
- Modify: `src/app.test.ts`

- [ ] **Step 1: Remove variant config from app shell**

Replace:

```ts
const variant = getGameVariantConfig('darts')
this.game = new DartsGame(stage, createDefaultHandProvider('darts' satisfies VariantId), variant, dartsMode)
```

with:

```ts
this.game = new DartsGame(stage, createDefaultHandProvider(), dartsMode)
```

Hard-code only darts copy where needed:

```ts
const dartsInstructions = 'Pinch thumb and index to grab a dart, push toward the screen, then unpinch to throw.'
```

- [ ] **Step 2: Add mode-specific chalkboard markup helpers**

In `modeDetails()`, render Cricket differently from player score rows:

```ts
if (mode.mode === 'cricket') {
  return `<div class="cricket-board">...</div>${mode.lastEvent ? `<p>${mode.lastEvent}</p>` : ''}`
}
```

Use chalk mark symbols for 0-3 marks:

```ts
private cricketMarks(count: number): string {
  return count >= 3 ? 'X' : count === 2 ? '/' : count === 1 ? '-' : ''
}
```

Keep Practice, 301, and Around the Clock readable with player score rows and the existing throw slots.

- [ ] **Step 3: Run app tests**

Run:

```bash
npx vitest run src/app.test.ts
```

Expected: PASS.

## Task 6: Generate And Add Pub Background Asset

**Files:**
- Add: `public/assets/pub-dart-lane.png`

- [ ] **Step 1: Generate image with built-in image tool**

Use this prompt:

```text
Use case: stylized-concept
Asset type: wide web game background for a darts throwing app
Primary request: realistic warm bar dart lane background
Scene/backdrop: empty pub dart lane with warm wooden wall panels, subtle amber bar lighting, a quiet central wall area for a 3D dartboard overlay, understated trim, no people
Style/medium: polished realistic game background, detailed but not cluttered
Composition/framing: landscape 16:9, central board area clean and readable, side walls provide atmosphere, foreground unobtrusive
Lighting/mood: cozy bar lighting, moderate contrast, readable center
Color palette: wood browns, chalkboard green-black accents, muted amber highlights
Constraints: no text, no logos, no brand marks, no people, no readable signs, no darts embedded in wall, no watermark
Avoid: neon sports bar look, heavy blur, dark unreadable corners, busy posters, floating objects
```

- [ ] **Step 2: Move selected asset into workspace**

Copy or move the selected generated image into:

```text
public/assets/pub-dart-lane.png
```

Expected: the app can reference `/assets/pub-dart-lane.png`.

## Task 7: Pub And Chalkboard Styling

**Files:**
- Modify: `src/style.css`

- [ ] **Step 1: Replace menu styling**

Style `.menu-shell` as a pub wall with a wood/chalkboard picker. Keep the four mode buttons visible without scrolling on desktop and stacked on mobile.

- [ ] **Step 2: Replace gameplay layout styling**

Use `/assets/pub-dart-lane.png` in `.game-stage`:

```css
.game-stage {
  background:
    linear-gradient(90deg, rgba(20, 13, 9, 0.18), rgba(20, 13, 9, 0.02) 45%, rgba(20, 13, 9, 0.36)),
    url('/assets/pub-dart-lane.png') center / cover no-repeat;
}
```

Keep `#game-canvas` absolutely positioned and full size.

- [ ] **Step 3: Style chalkboard sidebar**

Use `.hud-panel` as a framed chalkboard:

```css
.hud-panel {
  color: #f6eed8;
  background:
    linear-gradient(135deg, rgba(255,255,255,.04), transparent 28%),
    #10251f;
  border-left: 10px solid #5a351f;
  box-shadow: inset 0 0 38px rgba(0,0,0,.52);
}
```

Add `.cricket-board` styles for a compact chalk score grid. Ensure mobile media rules prevent overlap and keep text legible.

- [ ] **Step 4: Run a CSS color scan**

Run:

```bash
rg "#|rgb|hsl|gradient|background" src/style.css
```

Expected: palette includes wood, chalkboard, cream, red/green accents, and does not read as a single-hue theme.

## Task 8: Full Verification And Progress Notes

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: Search for removed legacy references**

Run:

```bash
rg "Basketball|basketball|Wizard|wizard|Slingshot|slingshot|Axe|axe|fireball|marble|variants" src public index.html
```

Expected: no matches except a false positive from third-party MediaPipe files if search scope includes generated dependency code. Do not search `progress.md`, because it intentionally records history.

- [ ] **Step 2: Run full tests**

Run:

```bash
npm test
```

Expected: all remaining tests pass.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected: exit 0. Existing Vite chunk-size warning is acceptable if unchanged.

- [ ] **Step 4: Run browser verification**

Start the local dev server and run the web game client against the menu and at least one throw in each darts mode. Use synthetic input:

```bash
node /Users/davidbachman/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js --url http://127.0.0.1:5174/?testInput=synthetic --actions-json '{"steps":[{"buttons":[],"frames":2}]}' --iterations 1 --pause-ms 200 --screenshot-dir /tmp/handthrow-darts-pub-menu
```

Then select Practice, 301, Cricket, and Around the Clock in separate runs and inspect screenshots plus `render_game_to_text()`.

- [ ] **Step 5: Inspect screenshots**

Open the latest desktop and mobile screenshots. Confirm:

- generated pub background is visible
- 3D dartboard is readable against the background
- chalkboard sidebar resembles a bar score sheet
- Cricket marks render compactly
- text does not overlap at desktop or mobile widths

- [ ] **Step 6: Update progress**

Append a note to `progress.md` with removed legacy code, generated asset path, tests/build result, and browser screenshot paths.

- [ ] **Step 7: Commit implementation**

Run:

```bash
git add src public index.html progress.md package.json package-lock.json
git add -u
git commit -m "feat: make darts a pub chalkboard app"
```

Expected: commit contains code, CSS, generated asset, and progress notes.

## Self-Review

- Spec coverage: cleanup, darts-only architecture, pub background, chalkboard sidebar, mode-specific scoring, testing, and browser verification are covered by Tasks 1-8.
- Placeholder scan: no `TBD`, vague `TODO`, or "similar to" steps.
- Type consistency: the plan uses `readyDartPosition`, `shouldShowReadyDart`, `createDefaultHandProvider()`, and `DartsGame(host, provider, mode)` consistently after the cleanup tasks.
