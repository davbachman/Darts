# Darts Pub UI Cleanup Design

## Context

The app is now a dedicated darts throwing app. The current codebase still contains legacy non-darts variants from the earlier HandThrow concept: Wizard Spells, Basketball, Slingshot, and Axe Throw. Those variants are hidden from the menu but still present in source, tests, renderer branches, gesture code, and progress history.

The visible UI also still reads like a clean web game shell. The requested direction is a bar darts experience: a warm pub throwing lane with a chalkboard sidebar that scores each darts game the way a player would expect to see it in a bar.

## Goals

- Remove old non-darts game code and tests instead of merely hiding them.
- Keep the app focused on Darts modes only: Practice, 301, Cricket, and Around the Clock.
- Revise the UI to use the approved Classic Pub Chalkboard direction.
- Use an image-generated pub dart-lane background asset for the game stage.
- Make the sidebar look and behave like a framed chalkboard score sheet.
- Preserve deterministic browser hooks and automated verification coverage.

## Non-Goals

- Do not keep Wizard Spells, Basketball, Slingshot, or Axe Throw as playable, hidden, or test-only features.
- Do not add new darts game modes beyond the existing four.
- Do not add online multiplayer, profiles, persistent history, or tournament settings.
- Do not redesign the core dart throwing gesture unless cleanup requires removing non-darts gesture branches.

## Cleanup Scope

Remove the old non-darts feature surface completely:

- Variant registry/config entries for Wizard Spells, Basketball, Slingshot, and Axe Throw.
- Projectile kinds, target kinds, impact behaviors, renderer branches, ready-object helpers, and text-state fields used only by those variants.
- Non-darts gesture state machines, synthetic provider branches, and tests.
- Non-darts game modules such as basketball impact and slingshot pullback.
- Old Vite scaffold assets and CSS selectors that no longer serve the darts-only app.

Keep shared infrastructure that is still used by darts:

- MediaPipe hand tracking and the darts pinch-push gesture path.
- Standard dartboard scoring, dart mode reducers, dart flight, dart orientation, sound support if still used by darts, and browser test hooks.

## Visual Direction

The approved direction is Classic Pub Chalkboard.

The first screen remains functional, not a landing page. It should feel like choosing a game from a bar chalkboard, with warm wood surroundings and concise mode choices. The gameplay screen should feel like standing at a pub dart lane: wood wall, subtle amber lighting, a realistic dartboard as the focal point, and a framed chalkboard score panel.

The palette should avoid a one-note dark theme by combining:

- deep green-black chalkboard surfaces
- warm wood browns for trim and background
- aged cream chalk text
- muted red and green accents from the dartboard
- small brass or amber highlights

No neon-heavy or decorative orb/gradient style should be used.

## Generated Pub Background

Use the built-in image generation tool to create a project-bound raster asset for the game stage background.

Prompt intent:

- Asset type: wide game background for a web darts app.
- Scene: realistic bar dart lane with warm wooden wall, subtle pub lighting, empty foreground, no people.
- Composition: quiet central region where the Three.js dartboard can remain readable; enough side texture for atmosphere; no text or logos.
- Style: realistic but not photorealistically cluttered, suitable behind a live 3D canvas.
- Avoid: people, brand marks, readable signs, darts embedded in the wall, heavy blur, dark unreadable corners, text, watermarks.

The selected asset should be copied into the workspace, for example `public/assets/pub-dart-lane.png`, and referenced by CSS or scene setup. Do not leave a project-referenced asset only under Codex's generated image directory.

## App Layout

### Menu

The menu becomes a pub chalkboard game picker:

- App title: `Darts`.
- Four mode buttons/cards: Practice, 301, Cricket, Around the Clock.
- Short descriptions only; no instructions-heavy landing copy.
- Visual framing should look like a chalkboard mounted on a bar wall.

### Gameplay

Desktop layout:

- Left/main area: full-height throwing stage with generated pub background and Three.js canvas.
- Right/sidebar: fixed-width chalkboard scoreboard framed in wood.
- The board and dart remain in the stage; the sidebar is for scoring and actions only.

Mobile layout:

- Stage stays first and large enough to throw.
- Chalkboard scoreboard stacks below or becomes a compact lower panel.
- Text must fit without overlapping or horizontal scrolling.

## Chalkboard Scoreboards

The sidebar should use chalk-style typography, ruled chalk lines, and mode-specific scoring layouts.

Practice:

- Shows round total.
- Shows three dart slots using compact labels such as `T20`, `S15`, `Bull`, `Miss`.
- Shows round complete state with replay.

301:

- Shows both players' remaining scores in large chalk numerals.
- Highlights the active player.
- Shows current turn darts.
- Shows bust and win messages in chalk status text.

Cricket:

- Shows targets `20`, `19`, `18`, `17`, `16`, `15`, and `B`.
- Shows marks for both players using chalk symbols.
- Shows points for both players.
- Clearly indicates closed numbers and the active player.

Around the Clock:

- Shows each player's current target.
- Shows current turn darts.
- Shows the active player and win state.

Actions:

- Keep `Replay` and `Menu` actions, styled as small chalkboard controls or wood-framed buttons.
- Avoid visible instructional text beyond the necessary throw prompt/status.

## Architecture

Simplify toward a darts-only architecture.

Expected modules:

- `src/app.ts`: Darts menu, mode starter, HUD/chalkboard rendering, browser text state.
- `src/game/darts-game.ts`: Three.js darts scene, dart object, board rendering, dart launch/flight/impact, hand provider integration.
- `src/game/dartboard.ts`: standard board order, hit geometry, scoring details.
- `src/game/dart-modes.ts`: Practice, 301, Cricket, and Around the Clock state transitions.
- `src/game/flight.ts` and `src/game/dart-orientation.ts`: dart-only flight and orientation helpers if still useful.
- `src/input/gesture.ts`: keep only the darts pinch-push gesture behavior.
- `src/input/hand-provider.ts`: keep only darts-oriented MediaPipe/synthetic hand input.

Remove the legacy variant abstraction if it no longer reduces complexity. If a small `dartsConfig` object remains useful, it should describe only darts, not a registry of variants.

## Text State And Testing

`window.render_game_to_text()` should remain concise and deterministic, including:

- app mode: menu or darts
- selected darts game mode
- active player
- player scores/progress
- current turn darts
- last standard score detail
- round or match status
- active dart flight state
- stuck dart count and relevant impact state

Tests should cover:

- removed non-darts identifiers are no longer exported through the variant/menu surface
- darts pinch-push gesture still arms and releases
- standard board scoring still resolves singles, doubles, triples, bulls, and misses
- Practice, 301, Cricket, and Around the Clock reducers still behave correctly
- app text state and DOM no longer reference old game variants
- chalkboard rendering helpers produce mode-specific labels where helpers are extracted

Verification should include:

- `npm test`
- `npm run build`
- browser checks for menu, Practice, 301, Cricket, and Around the Clock
- visual inspection of desktop and mobile screenshots to confirm the pub background, dartboard readability, and chalkboard scoreboard layout

## Risks

- Removing legacy branches touches shared gesture and renderer code, so regressions are possible in dart throwing if cleanup is too broad.
- The generated background may compete visually with the 3D dartboard. It must be quiet enough behind the board and should be adjusted or dimmed in CSS if needed.
- Chalk-style fonts can hurt readability if overused. Use the chalk treatment for headings, numerals, and score marks while keeping status text legible.

## Approved Decisions

- Remove old non-darts code and tests completely.
- Use the Classic Pub Chalkboard visual direction.
- Use image generation for the pub background asset.
- Preserve the four existing darts game modes.
