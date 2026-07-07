# Wizard Thumb Spells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wizard spells arm when a closed fist has the thumb pointed away from the screen, then launch a fireball from the wand tip when the closed fist moves to thumb-toward-screen.

**Architecture:** Add thumb direction as a first-class hand-frame signal alongside finger direction, introduce a wizard-specific gesture kind so other fist gestures are unchanged, and compute the fireball launch start from the wand tip helper used by rendering. Keep the current straight fireball path and board impact behavior.

**Tech Stack:** TypeScript, Three.js, Vitest, Vite, existing Playwright web-game client.

---

### Task 1: Thumb Direction Gesture Signal

**Files:**
- Modify: `src/input/gesture.ts`
- Test: `src/input/gesture.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that expect `createHandFrameFromLandmarks` to report `thumbDirection: 'toward-screen'` when thumb tip z is closer than thumb MCP, and `thumbDirection: 'away-from-screen'` when thumb tip z is farther.

- [ ] **Step 2: Run targeted tests**

Run: `npm test -- src/input/gesture.test.ts`
Expected: FAIL because `thumbDirection` is not implemented.

- [ ] **Step 3: Implement minimal signal**

Add `ThumbDirection`, add `thumbDirection?: ThumbDirection` to `HandFrame`, and estimate it using thumb MCP/tip z deltas with the same threshold style as `estimateFingerDirection`.

- [ ] **Step 4: Verify targeted tests**

Run: `npm test -- src/input/gesture.test.ts`
Expected: PASS.

### Task 2: Wizard Thumb Hold/Release

**Files:**
- Modify: `src/input/gesture.ts`
- Modify: `src/variants/config.ts`
- Modify: `src/input/hand-provider.ts`
- Test: `src/input/gesture.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that a `thumb-wand-flick` tracker enters `held` for `handShape: 'fist'` with `thumbDirection: 'away-from-screen'`, and releases for `handShape: 'fist'` with `thumbDirection: 'toward-screen'`.

- [ ] **Step 2: Run targeted tests**

Run: `npm test -- src/input/gesture.test.ts`
Expected: FAIL because the gesture kind and thumb predicates do not exist.

- [ ] **Step 3: Implement minimal gesture**

Add `thumb-wand-flick` to `ThrowGestureKind`, wire hold/release predicates, configure wizard spells to use it, and update synthetic wizard input to emit thumb-away before release and thumb-toward during release.

- [ ] **Step 4: Verify targeted tests**

Run: `npm test -- src/input/gesture.test.ts`
Expected: PASS.

### Task 3: Wand Tip Launch

**Files:**
- Modify: `src/game/darts-game.ts`
- Test: `src/game/darts-game.test.ts`

- [ ] **Step 1: Write failing tests**

Add a test that `wandTipWorldPosition(aim)` starts in front of the held wand at the visible tip, closer to the target than `readyPosition(aim, 'fireball')`.

- [ ] **Step 2: Run targeted tests**

Run: `npm test -- src/game/darts-game.test.ts`
Expected: FAIL because the helper is not exported/used.

- [ ] **Step 3: Implement minimal launch helper**

Export `wandTipWorldPosition`, use it when `projectile === 'fireball'`, and keep ready-wand rotation consistent with a wand cocked away from the target while held.

- [ ] **Step 4: Verify targeted tests**

Run: `npm test -- src/game/darts-game.test.ts`
Expected: PASS.

### Task 4: Full Verification

**Files:**
- Update: `progress.md`

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 2: Build production bundle**

Run: `npm run build`
Expected: build exits 0. Existing Vite chunk-size warning is acceptable.

- [ ] **Step 3: Browser-check wizard mode**

Run the existing web-game Playwright client against `/?testInput=synthetic`, click `#play-wizard-spells`, wait through a release, inspect text state and screenshot.
Expected: wizard reaches `gestureState: released`, active flight projectile is `fireball`, and screenshot shows fireball traveling from wand/foreground to the target.
