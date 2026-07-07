# Darts App Design

## Context

HandThrow currently presents a multi-variant throwing game with Darts, Wizard Spells, Basketball, Slingshot, and Axe Throw. Darts is the strongest variant, so the visible product should become a dedicated darts app while preserving the existing non-darts code for future use.

The app already has a Three.js throwing scene, MediaPipe hand input, synthetic test input, a simple dart round model, and simplified circular scoring. This design keeps those working pieces and replaces the user-facing shell and dart rules.

## Goals

- Make the visible app title and product surface `Darts`.
- Remove all non-darts options from the UI without deleting their source code.
- Replace the simplified target with a realistic dartboard.
- Add selectable game modes: Practice, 301, Cricket, and Around the Clock.
- Implement fully scored game rules.
- Support two local players for 301, Cricket, and Around the Clock.
- Preserve deterministic browser hooks and text state for automated testing.

## Non-Goals

- Do not delete Wizard Spells, Basketball, Slingshot, or Axe Throw code.
- Do not add online multiplayer, persistent profiles, or saved match history.
- Do not require exact steel-tip tournament options beyond the rules specified here.
- Do not redesign the gesture mechanics for throwing darts.

## Product Flow

The first screen becomes a darts game menu instead of a variant selector. It shows:

- Practice
- 301
- Cricket
- Around the Clock

Selecting a mode starts the existing darts throw scene with mode-specific HUD panels, scoreboards, and turn state. The `Menu` button returns to the darts game menu. The browser document title should be `Darts`.

Non-darts variants remain available in code paths such as config and registry, but they are not shown in the opening menu.

## Board Rendering

The board should look like a standard dartboard:

- 20 numbered wedge segments in standard clock order: 20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5.
- Alternating dark and light single-score wedges.
- Red and green double and triple bands.
- Green outer bull and red inner bull.
- Dark outer rim.
- Thin wire separators between segments and rings.
- Number labels around the rim.

The board remains a Three.js mesh group at the existing target depth. Rendering can be built from ring-sector shapes and text sprites or canvas-backed textures, whichever fits the current code best.

## Dart Scoring Model

Scoring must use standard dartboard geometry instead of simple distance rings.

The score resolver should return enough structured detail for all games:

- segment number, when the hit lands in a numbered wedge
- multiplier: 1, 2, or 3
- area: single, double, triple, outer bull, inner bull, or miss
- points
- normalized impact coordinates

Hits outside the double ring are misses. Bulls score 25 and 50. Segment wedges follow the standard board order.

## Practice Mode

Practice is single-player. It keeps the interaction lightweight:

- Player throws three darts per round.
- The HUD shows the current round total and each dart result.
- The round-complete overlay shows the total and can replay.

Practice uses the standard dartboard scoring resolver, including segment and multiplier labels.

## 301 Mode

301 supports two local players:

- Both players start at 301.
- Players alternate turns.
- Each turn is up to three darts.
- Each dart subtracts its points from the active player's remaining score.
- If a turn would take the player below zero, the whole turn busts and the player's score returns to the value at the start of that turn.
- Reaching exactly zero wins.
- This pass uses straight-out rules, so a double is not required to finish.

The HUD should show both remaining scores, active player, current turn darts, and bust or win state.

## Cricket Mode

Cricket supports two local players and standard cricket targets:

- Targets are 20, 19, 18, 17, 16, 15, and bull.
- Singles count as one mark, doubles as two marks, triples as three marks.
- Bulls count as one or two marks for outer and inner bull.
- A number is closed for a player at three marks.
- If a player has closed a number and the opponent has not, extra marks on that number score points.
- Once both players close a number, it no longer scores.
- The winner is the player who closes every cricket target and has a score greater than or equal to the opponent.

The HUD should show a compact cricket scoreboard with marks for both players, points, active player, and current turn darts.

## Around the Clock Mode

Around the Clock supports two local players:

- Players start at target 1.
- A hit on the active target advances the player to the next target.
- Doubles and triples still count as a hit on that target but do not skip ahead.
- After 20, the final target is bull.
- First player to complete bull wins.
- Players alternate up to three-dart turns.

The HUD should show each player's current target, active player, current turn darts, and win state.

## Architecture

Add a darts-specific game mode layer instead of turning the old variant system into a darts rules engine.

Recommended units:

- `src/game/dartboard.ts`: standard board segment constants, impact-to-score resolver, and board geometry helpers where practical.
- `src/game/dart-modes.ts`: mode types, initial states, turn application, bust/win logic, cricket marks, and around-the-clock progression.
- `src/app.ts`: render the Darts menu and pass the selected darts mode into the scene.
- `src/game/darts-game.ts`: keep responsibility for Three.js rendering, hand input, flight animation, impact capture, and delegating finished dart hits to the selected mode state.

Existing non-darts config and renderer branches can remain for now. The visible app should instantiate the darts config only.

## Text State And Testing

`window.render_game_to_text()` should include:

- `mode`: menu or darts
- selected darts game mode
- active player
- player scores/progress
- current turn darts
- last dart standard score detail
- round or match status
- active flight state

Tests should cover:

- non-darts variants are preserved but hidden from the menu
- board geometry scores singles, doubles, triples, bulls, and misses
- 301 turn scoring, bust reset, player alternation, and exact-zero win
- Cricket mark application, extra-point scoring, closed numbers, and win condition
- Around the Clock target advancement and win condition
- Practice still records three standard-scored darts
- browser smoke check for menu, board visibility, mode switching, and a synthetic throw

## Visual And UX Constraints

- Keep the first screen functional rather than a marketing landing page.
- Avoid adding explanatory text beyond concise mode labels and essential HUD status.
- Keep the existing fullscreen key behavior.
- Maintain responsive layout on desktop and mobile.
- Ensure HUD text fits in its containers.
- Use restrained, utilitarian styling suitable for repeated play.

## Open Decisions Resolved

- 301 and Cricket support two local players.
- Around the Clock also supports two local players for consistency.
- 301 uses straight-out rules in this pass.
- Existing non-darts code is hidden, not deleted.
