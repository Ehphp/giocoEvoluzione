# Frontend responsive refactor audit

## Scope and approach

This is a conservative frontend refactor. Existing assets, colours, fonts, game rules, scoring, Supabase contracts and progression data are unchanged. The work concentrates on the responsive battle presentation and the presentation-side async paths that can show stale information.

## Frontend map and match flow

| Area | Entry components | Role |
| --- | --- | --- |
| App shell and session orchestration | `App.tsx` | Authentication gate, session restore, lobby, realtime refresh, round transitions and result routing. |
| Home and lobby | `home/*`, `HomeScreen.css` | Authenticated/guest home, play-mode drawer, create/join/bot actions. |
| Waiting room | `App.tsx` | Shows and copies the room code until a remote participant joins. |
| Battle/gene choice | `game-v2/*` | HUD, event panel, battle arena, gene choice, waiting state and actions. |
| Round reveal | `RoundResultModal` in `App.tsx` | Modal reveal, tiebreak values and transition to the next round. |
| Final result | `game-results/*` | Match recap, actions, rewards and return/new-match controls. |
| Account/evolution technical screens | `auth/*`, `profile/*`, `creature-visual-progression/*`, `creature-transformation-lab/*` | Authentication, profile/history and opt-in visual-progression tools. |

The regular match flow is: home/lobby → create or join → waiting room (PvP only) → gene choice/battle → waiting or resolution → round reveal → next round, or final results after the last round.

## Analysis findings

### Shared and duplicated presentation

- `App.tsx` owns session state and assembles the game screen; `GeneSelectionScreenV2` owns the battle layout; `BattleStage` is the reusable creature/VS renderer.
- Game-specific tokens already live in `game-ui-tokens.css`; battle, home and result screens each have focused CSS.
- `App.css` still contains older game-layout rules alongside the newer V2 styles. They are retained in this conservative pass because removing selectors without a route-by-route visual baseline would be a broad, unrelated change.

### Existing responsive constraints

- The global document has a `320px` minimum width and blocks horizontal overscroll.
- The game uses `svh` with `dvh` fallback, safe-area insets and grid layouts. Important implicit layout switches occur at `370px`, `400px`, `641px`, `760px`, `1024px`, and short landscape heights.
- The battle is intentionally positioned internally with absolute layers; this is appropriate for sprites and the VS artwork, but its old sizing had no normalized maximum width for arbitrary PNGs.

## Bugs found and corrections

| Bug | Cause | Conservative correction |
| --- | --- | --- |
| A guest could not be proven to be on the local presentation side independently of player slot. | The V2 view model received `me`/`opponent` indirectly and had no explicit local/remote model. | Added `buildBattleParticipants`, which resolves the local participant by active participant ID and derives the remote participant from that identity. Host and guest cases are unit-tested. |
| Generated or future left-facing creature assets could face away from the opponent. | The CSS unconditionally mirrored only the opponent layer. | Added `nativeFacing` and one `shouldMirrorCreature` rule. Only the image gets the mirroring class; its wrapper, shadows and any future labels remain unmirrored. |
| The built-in purple bot could face away from the player. | Its PNG already faces left, but it was incorrectly declared as a right-facing asset and was mirrored again. | Marked the bot fallback as `nativeFacing: 'left'`; the fallback path also recomputes direction after a failed image load. |
| Wide/tall PNGs could invade the centre field or clip unpredictably. | Creature images used `max-width: none`, 66–72% lanes and viewport-specific enlargement without a normalized image box. | Each sprite now has a bounded 48% side lane, `max-width: 100%`, `object-fit: contain` and a bounded height; the VS remains an independently centred layer. |
| A realtime channel could remain subscribed if the async subscription completed after its effect had unmounted. | Cleanup ran before the promise had assigned `unsubscribe`. | The effect now tracks whether it is active and immediately disposes a late subscription. |
| A slow snapshot response could restore stale game state after leaving, or win over a newer refresh. | Refresh responses were always committed in resolution order. | Added a monotonic refresh ID and an active game/participant guard before committing a snapshot. Leaving a session invalidates pending refreshes. |
| A visual URL from the previous match could momentarily be used in a new match. | Visual state was not associated with the game that loaded it. | Visual state now carries `gameId`; it is rendered only for the current game. |
| The visual audit did not cover the 320px floor, horizontal overflow, centred VS, or reachability of actions on a short screen. | The audit was focused on larger portrait viewports and full initial visibility. | Extended the deterministic browser audit with 320×568, horizontal-overflow, VS-centering and scroll-reachability checks. |

## Changes made

1. Made local/remote participant mapping explicit at the game V2 presentation boundary.
2. Centralized creature orientation and normalised the battle sprite box without changing the art or palette.
3. Hardened session restoration, realtime subscription cleanup and snapshot ordering.
4. Scoped signed creature visuals to their loaded match.
5. Added unit coverage for host/guest mapping and creature orientation; extended the visual audit criteria.

## Files changed

- `src/App.tsx`
- `src/main.tsx`
- `src/components/game-v2/gameSelectionAssets.ts`
- `src/components/game-v2/GameLayoutAuditScreen.tsx`
- `src/components/game-v2/GeneSelectionScreenV2.css`
- `src/components/game-v2/components/BattleStage.tsx`
- `src/components/game-v2/components/BattleStage.test.ts`
- `src/components/game-v2/controller/buildGeneSelectionV2ViewModel.ts`
- `artifacts/mobile-layout-audit.mjs`

## Components and helpers added

- `controller/battleParticipants.ts` — explicit local/remote participant model.
- `controller/battleParticipants.test.ts` — host and guest mapping coverage.
- `components/creatureOrientation.ts` — single native-facing/mirroring rule.
- `GameLayoutAuditScreen.tsx` — development-only deterministic battle scenario, available at `/?layout-audit=1` while Vite is running.

No existing components or assets were removed.

## Test and viewport verification

Completed during this refactor:

- Focused Vitest: `BattleStage`, battle participant mapping and game V2 view-model tests — 3 files, 8 tests passed.
- Full Vitest: passed; the bot-orientation regression test added afterwards also passes in isolation.
- Typecheck: `npx tsc -b` passed.
- Lint: `npm run lint` passed.
- Production build: `npm run build` passed. Vite reports only its existing chunk-size advisory for the 529 kB application bundle.
- Browser battle audit: passed with no document or horizontal overflow, centred VS and reachable gene/action controls. Results are in `artifacts/mobile-layout-current/battle-metrics.json` with screenshots for each viewport.

The browser audit verified 320×568, 360×800, 390×844, 412×915, 430×932, 768×1024, 844×390, 1440×900 and 1920×1080. It checks no document overflow, no horizontal overflow, five selectable genes, usable actions, a centred VS, a visible arena and no duplicate battle background. On the intentionally short 320×568 viewport, genes and actions are both reachable within the game screen’s vertical scroll area rather than forcing a horizontal or document-level overflow.

## Remaining open items

- Legacy rules retained in `App.css` should be removed only as a separately visual-regressed cleanup, since some may support non-V2 session states.
- Generated creature visuals still default to `right`; a future image metadata contract can set `nativeFacing: 'left'` without touching presentation logic. The supplied bot fallback is explicitly `left`.
- Realtime transport status is not exposed by the current API. The UI reports browser offline state and subscription setup failures, but cannot distinguish every socket reconnect phase until the client exposes that signal.

## Manual verification checklist

- [ ] Create a PvP match as host and confirm the host creature, name, score and genes appear on the local/left side.
- [ ] Join the same room as guest and confirm the guest sees their own creature, name, score and genes on the local/left side.
- [ ] Confirm both creatures face inward; verify labels, score cards and badges are not mirrored.
- [ ] Check 320px portrait and short landscape: no horizontal scroll, VS remains centred and both action buttons can be reached.
- [ ] Check a modern iPhone/Pixel portrait with browser chrome expanded and collapsed; safe areas keep the dock reachable.
- [ ] Use long player names and confirm HUD ellipsis does not make controls overflow.
- [ ] Submit a gene twice rapidly; only one action must persist and the waiting state must replace actions.
- [ ] Disconnect/reconnect during choosing and verify the current game and selected state do not revert to an older match.
- [ ] Leave a match while network requests are pending; it must not reappear after returning to home.
- [ ] Complete a round, a tiebreak and a final result; confirm layout and controls remain usable in each modal/state.
