# AGENTS.md — working on the Evori interface

Rules for anyone (human or agent) touching the UI. They exist so the interface stays coherent
as rebuilt from the original concept artwork. The reasoning behind them is in
[`docs/ui-design-system.md`](docs/ui-design-system.md); this file is the operating manual.

Read this before writing UI code. If a rule blocks something the product needs, change the rule
here in the same commit — do not quietly work around it.

**Anything that has to be done on the Supabase project** — deploying an Edge Function, adding or
removing a secret, dropping a database object, changing auth config — goes in
[`TODO_SUPABASE.md`](TODO_SUPABASE.md). Do not leave it only in a conversation: that work cannot be
done from the repository, so it needs a written home.

---

## 1. The boundary: presentation vs game logic

The refactor rewired the presentation; it did not change the game. **Keep it that way.**

| Layer | Path | You may |
| --- | --- | --- |
| Design system | `src/ui/**` | edit freely |
| Screens | `src/screens/**` | edit freely |
| Dev preview | `src/dev/**` | edit freely |
| App shell state | `src/app/**` — one hook per concern: route, match session, creature visuals, profile activity | **read and re-wire, do not re-derive** |
| View models / controllers | `src/screens/battle/controller/**`, `src/screens/<screen>/build-*-view-model.ts` and its `types.ts` | **read and re-wire, do not re-derive** |
| Presentation config | `src/screens/battle/controller/{gene-selection-assets,creature-orientation}.ts` | tune sizing/paths only |
| Game rules & data | `shared/**`, `src/game/**`, `src/lib/**`, `src/auth/**`, `supabase/**`, `tools/**` | **do not touch for UI work** |
| Evolution screen (flag-gated) | `src/components/creature-visual-progression/**` | keep functional; it wears the design system too (see §4) |

If a screen needs a value the view model does not expose, **add it in the view model**, do not
recompute rules in a component. Scores, affinities, predictions and labels all come from the
model — a component must never re-implement a game rule.

---

## 2. File shape: one responsibility, one order

Every file reads in the same order, so you can find a thing by where it sits rather than by
searching. This section describes what the code already does — it is written down so the next
outlier is a review comment instead of a silent drift.

**A component file (`.tsx`)**

```
1  import          external → shared/ → src/ → relative → './Component.css' last
2  type            Props first, then local types
3  const           module constants, lookup maps
4  function        module-level pure helpers (outside the component)
5  function        sub-components, in the order the export uses them
6  export function THE COMPONENT
```

and inside the component:

```
state      useState, useReducer
derived    useMemo, useRef, values computed from props/state
effect     every useEffect, grouped together
handler    event handlers and async actions
guard      early returns (loading, empty, error)
render     the single return
```

**Each kind appears once, as one block.** Scattering three `useEffect` across a file is what makes
a component unreadable — if you need a fourth effect in a third place, extract a hook instead.

Two cases legitimately break the straight order, and both must be labelled with a
`// --- <phase> ---` comment so the reason is visible:

- **Seeded state.** When a `useState` initial value comes from a derived value, that derived value
  has to precede it, so the file alternates derived → state → derived. `CollectionScreen` is the
  worked example: `availableLineages` → `resolvedActiveLineageId` → `selectedLineageId`.
- **Derived values a guard needs.** Every hook must run before any early return, so values only
  used by the guard sit *after* the effects.

**A non-component module (`.ts`)**

```
1 import → 2 exported types → 3 constants → 4 private helpers → 5 public API
```

**Across the whole repository**

- **One responsibility per file.** A file that needs "and" to describe it is two files.
- **One statement per line.** No `;`-chained statements, no whole functions on one line.
- **`kebab-case.ts`** for every non-component module, in `src/` as well as `shared/` and
  `supabase/`. **`PascalCase.tsx`** only for files whose default subject is a component.
- **Named exports only.** `App.tsx` is the single deliberate `export default`.
- **A view model lives beside the screen it feeds** — `src/screens/<screen>/build<Screen>ViewModel.ts`,
  never in a sibling folder.

---

## 3. Never hard-code a design value

Everything visual comes from a token in `src/ui/theme.css`.

```css
/* NO */  color: #4fb84f;  border-radius: 20px;  gap: 12px;
/* YES */ color: var(--ev-player);  border-radius: var(--ev-r-lg);  gap: var(--ev-s-3);
```

`theme.css` has two halves. The top **BRAND PALETTE** block is the re-skin surface: each colour
family is three stops (`-light`, base, `-dark`) because the look is built from three-stop
gradients. The bottom **DERIVED** half builds gradients, strokes, shadows and scales from it.
Adding a new colour means adding a family to the palette, never a hex in a component.

Per-gene colour is automatic: put `data-gene="FEROCITY | ARMOR | AGILITY | SENSES | CAMOUFLAGE"`
on a container and use `var(--gene-color)`, `var(--gene-color-strong)`, `var(--gene-color-soft)`.

---

## 4. Compose primitives, do not restyle them

`src/ui/components.tsx` is the vocabulary:

`AppShell` · `Panel` · `Button` · `ActionButton` · `IconButton` · `Chip` · `Pill` · `Badge` ·
`SectionLabel` · `Avatar` · `ProgressBar` · `Pips` · `Overlay` · `SheetHeader` · `Notice`

`ScreenTransition` is a primitive too, but it lives in its own file because it wraps whole screens
rather than sitting inside one — see §5.

- Build screens out of these. A screen stylesheet may lay them out; it must not repaint them.
- Need a new visual behaviour? Add a **variant to the primitive**, not an override in a screen.
- `Button` tones: `use` · `evolve` · `gold` · `info` · `cream` · `ghost` · `danger`.
  `IconButton` variants: `glass` · `cream` · `danger`.
- Gold is reserved for the VS badge and the single primary call to action on a screen.
- Green is always "you" / USA; purple is always the opponent / EVOLVI and everything evolution.

**The internal tools use the same language.** They are denser than a product screen, but they are
cream panels with token colour, display headings and the same pressable lip — not a second visual
system. They style with CSS against the tokens rather than importing `src/ui` primitives, because
their markup is deliberately dense; the result must still be indistinguishable in *look*.

**Overlays are game layers, not pages.** `Overlay` takes `scrim` and `width`: `scrim="scene"` +
`width="narrow"` is for content that sits straight on the battlefield with no panel under it, so
the scene stays visible and readable behind. Reach for `--ev-scrim-focus` and
`--ev-shadow-text-on-scene` to give loose copy contrast without reintroducing a card edge.

An overlay belongs to the screen that opened it, and withdraws by itself when that screen starts
leaving — it portals to the body, so no transform on the outgoing layer could carry it away.

---

## 5. Motion

There are exactly two ways something new can appear, and the first question is always which one
this is.

**A layer opens on top of the screen.** It rises from the bottom over a blurred scrim
(`.ev-sheet` / `.ev-overlay`, `--ev-dur-base`). That is the `Overlay` primitive of §4 and it needs
no decision: sheets, confirmations, the round result, the evolution draft are all layers.

**A screen replaces another.** It moves horizontally, or cross-fades. Never both, never vertically —
vertical is spoken for by layers, and reusing it would make a screen change read as a sheet.

Screens never cut. `App.tsx` resolves *which* screen to show and hands it to `ScreenTransition`
(`src/ui/ScreenTransition.tsx`) with its identity and its depth; the transition layer animates the
swap. Two layers are on stage for 300ms — the screen arriving, and the one it replaced.

**Adding a screen means adding it to `src/app/screen-depth.ts`.** The depth is not decoration: it
picks the move, and it is the only input.

| Depth change | Move | Reads as |
| --- | --- | --- |
| deeper | `push` | the new screen slides in over the old one, which drifts back |
| shallower | `pop` | the old screen slides away and uncovers the one beneath |
| equal | `fade` | a cross-fade |

Two invariants the depth table has to satisfy, both pinned by `screen-depth.test.ts`:

- **Every destination reachable from the dock shares depth 1.** The dock is rendered *inside* each
  screen, so a slide would drag it along; a cross-fade of two near-identical docks reads as the dock
  standing still while only the active tab changes. Do not give a dock destination its own depth
  unless you have first hoisted the dock out of the screens.
- **Nothing pops on the way *into* something.** A depth table can read perfectly as a stack and
  still send a route backwards. The result screen did: one level deeper than the battle it followed,
  which turned "nuova partita" into a pop, because a rematch restarts from the result screen without
  passing through the home screen. It sits level with the battle instead — the duel resolving, not a
  further place inside it.

`screen-depth.test.ts` enumerates every screen change the app can perform and asserts its move. Add
the rows for a new screen there; that table, not the depth numbers, is what says the criterion still
holds.

Rules that keep it honest:

- **Full-screen motion is `transform` and `opacity` only.** Anything else repaints, and repainting
  the whole viewport drops frames on a mid-range Android. A *control* may transition `box-shadow` or
  `filter` — that is how the lip compresses under a press — because the repaint is 46px wide. The
  test is the area, not the property.
- **Two stacked layers must never both pass through half opacity** — the ground shows between them
  and the screen dips. Whichever layer is underneath holds opaque until the one above covers it.
- **Durations and curves are tokens** (`--ev-dur-*`, `--ev-ease*`). `--ev-ease` is front-loaded and
  right for a 46px control; a full-screen move uses `--ev-ease-screen`, which spreads the travel
  across the whole duration instead of flicking and then sitting still.
- **`prefers-reduced-motion` is handled once**, in `theme.css`, by collapsing the duration *and*
  the travel tokens. A 1ms slide is a jump; a 1ms cut is a cut. Never add a motion value that
  bypasses those tokens.
- The outgoing screen is re-rendered, not re-mounted, so its scroll position and state survive the
  exit. Do not restructure the layers in a way that changes that — see the test for what it costs.

Watch all three moves with `?ui-preview=transitions`, which is the only place they are reachable
without a session.

### Sound and vibration

One vocabulary, in `src/ui/feedback/cues.ts`: `tap` · `select` · `back` · `confirm` · `evolve` ·
`impact` · `win` · `lose` · `alert`. A cue name owns **both** a sound recipe and a vibration pattern,
so the two can never drift apart. `playCue('confirm')` fires both, or neither if the player has
switched feedback off.

**Feedback is wired into the primitives, not into screens.** `Button` and `ActionButton` read their
cue off the `tone` they already carry — tone *is* what the button means (§4), so it is also the right
source for the sound. `IconButton` follows its variant. Pass `cue` to override, `cue={null}` for
silence. Do not add a `playCue` next to an `onClick` that a primitive already covers; the reason the
whole app has feedback from one change is that no call site has to remember.

A screen only plays a cue for something that is not a press: the round clash, an evolution, the
match verdict. Those live where the moment is (`RoundResultOverlay`, `MatchResultScreen`).

- **Nothing plays unprompted.** Every cue answers a player action. The `AudioContext` is built on the
  first cue, never at import: one created outside a user gesture stays suspended forever on iOS, so
  the failure is silent and permanent. Never construct one eagerly.
- **Silence is an acceptable outcome.** No Web Audio, refused resume, storage unavailable — all
  degrade quietly. A game that cannot make a noise still plays.
- **`navigator.vibrate` does not exist on iOS Safari and will not.** Haptics there need the native
  layer once the app is wrapped for the stores; the swap point is `haptics.ts`, not the call sites.
- **Verdict cues are for the match, not the round.** Seven fanfares in a duel stop meaning anything.
- New cue? Add it to *both* tables in `cues.ts` — `cues.test.ts` fails until you do, and also holds
  the length, gain and vibration budgets.

The sounds are synthesised, not sampled: no assets, no download, works offline. That is a starting
point. Authored samples replace `SOUND_RECIPES` alone — the cue names are the contract.

### Presses and lists

**A press is asymmetric.** Down is fast and flat (`--ev-dur-press` with `--ev-ease`); up is slower
and overshoots (`--ev-dur-release` with `--ev-ease-spring`). One transition cannot bend both ways, so
the release timing lives on the base rule and the press timing on `:active`. Getting this backwards —
one shared timing — is exactly what makes a button feel dead.

**The lip compresses; it does not travel.** A pressed control sinks *into* its own edge:
`--ev-lip` becomes `--ev-lip-pressed` while the surface moves down by `--ev-press-sink`. Moving the
whole thing down, lip included, reads as sliding. A tone that carries its own elevation
(`--ev-btn--cream`, `--ev-btn--ghost`) needs its own pressed elevation, placed *after* the base
`:active` rule — same specificity, so order decides.

Anything pressable that is not an `ev-btn` — the draft options, the gene cards — wears the same
curves off the same tokens. A second press feel is a second visual system.

**Lists assemble.** Put `ev-stagger` on a container and its direct children cascade in. The delays
are enumerated by position in `components.css`, so adopting it is one class on the container and
nothing in the rows — the same reason feedback lives in the primitives. Rows past the enumerated ones
share `--ev-stagger-max`, so a long list arrives instead of trickling. Keep the animation
`backwards`, never `both`: a row still holding a transform is a containing block for every
`position: fixed` inside it.

---

## 6. Icons and assets

**Icons come from `src/ui/icons.tsx` only.** It re-exports Lucide under product names, plus the
hand-drawn `GeneIcon` for the five adaptations.

- Do not `import ... from 'lucide-react'` in a screen. Add the re-export instead.
- **Never use an emoji or a text character as an icon** (`×`, `→`, `›`, `⌂`). The display face
  does not carry all of them and they render as tofu — this actually shipped once.
- Icons size from the container's `font-size` (`svg { width: 1em; height: 1em }` in `base.css`).
  Set `font-size`, never `width`/`height` on an icon.
- Exit controls use `IconButton variant="danger"` with `ExitIcon` for **logging out of the
  account**. The live Battle header is the exception: its profile menu uses `BackIcon` while
  retaining the same confirmed match-abandonment flow. Abandoning a running match must ask for
  confirmation first.

**Image paths come from `src/ui/assets.ts` only.** No `/assets/...` string in a component.
Files live under `public/assets/{branding,battle,creatures,game-ui}`.
Environment illustrations are drawn **16:9** and framed 16:9 everywhere.

### The rasters in `public/` are generated

`public/` is copied **verbatim** by Vite — no hashing, no compression, no warning. A PNG dropped in
there ships to the store at whatever size it happens to be, which is how a 2.3MB logo sat in the
bundle. So:

- **Masters live in `assets-source/`, outside `public/`.** They are never served.
- **`npm run assets:optimize`** writes the WebP derivatives that do ship, from the specs in
  `tools/optimize-assets.ts`. New artwork means a new spec, not a file copied into `public/`.
- **`npm run assets:check`** fails on a derivative that is missing, stale, over budget, or orphaned
  by a renamed spec. `tools/shipped-assets.test.ts` holds the same budgets from the other side, plus
  "no PNG or JPEG ships at all" and "every path the manifest names is a file the pipeline produces".

**WebP only** — no PNG fallback, no AVIF. WebP predates every OS the stores will run, so a fallback
is bytes nobody fetches; AVIF would need `<picture>` at every call site to stay safe on iOS 15, and
after WebP took ~4.5MB off the bundle the rest does not pay for that.

**Widths are justified, not generous.** Each spec carries the reason for its steps. Never emit above
the master's width — upscaling costs bytes and buys nothing — and do not add a step no store device
would choose: an unfetched variant is still weight inside the app bundle.

`srcSetFor(src)` returns the candidate set for a path the manifest owns, and `undefined` for anything
else (an SVG, a signed Supabase URL). That is why `AppShell` can serve every screen's scenery
responsively without a single screen knowing about it. **A `srcSet` without `sizes` fetches the widest
candidate** — the browser assumes the image fills the viewport — so pass `sizes` wherever it does not.
The logo is the cautionary case: 300px on the home screen and 30px in the collection top bar, off one
manifest entry.

---

## 7. Mobile is the target, and the real viewport is smaller than you think

A 390×844 iPhone reports about **390×664** to the page once browser chrome is up, and a notch adds
47px top + 34px bottom of safe-area inset. Design against that, never against the nominal size.

- **One elastic block per screen, and it is always decorative.** Battle: the arena
  (`flex: 1 1 124px`). Home: the creature stage. It yields space so headers and controls never do.
  Controls, actions and navigation are `flex: 0 0 auto`.
- Trim with height tiers (`@media (max-height: …)`), dropping decoration before information.
  When something must go under 40px to fit, **remove it instead of shrinking it**.
- Every interactive target is at least **40×40**.
- Use `dvh`, never `vh`, for full-height surfaces.

### Scrolling

The document never scrolls — `html`/`body` are locked in `base.css`, which is what removes the
rubber-band. **Surfaces scroll, the page does not.**

Any new full-screen surface must either go through `AppShell` (add `scroll` if its content can
exceed the viewport) or declare its own `height: 100dvh; overflow-y: auto;
overscroll-behavior-y: contain`. Otherwise its content becomes unreachable.

---

## 8. Overflow is a bug

Nothing may be clipped, hidden or pushed off screen. Deliberate truncation is fine **only** when
the user sees it: `text-overflow: ellipsis` or `-webkit-line-clamp`, plus the full text in `title`
or `aria-label`.

Five traps that already cost us a round of fixes:

1. **Ellipsis clips descenders.** `overflow: hidden` + a line-height under ~1.35 cuts Baloo 2's
   ascenders. `.ev-truncate` carries `line-height: 1.4`; do not override it lower.
2. **Inline images leave a baseline gap.** An `<img>` in a fixed-size frame needs
   `display: block`, or it overflows its own frame by a few pixels.
3. **Percentage heights collapse on auto-sized grid tracks.** `height: 100%` on a grid item
   silently falls back to the image's intrinsic size and escapes its frame. Give the frame a
   definite size (`aspect-ratio` + a width) and anchor the image with
   `position: absolute; inset: 0` instead.
4. **`align-items: stretch` beats `aspect-ratio`.** A thumbnail in a stretched grid row needs
   `align-self: center` or it squares up.
5. **`overflow: hidden` is load-bearing on grid items.** Removing it restores `min-width: auto`,
   so the item sizes to its content's intrinsic width and blows the layout out. Set
   `min-width: 0` (or a `minmax(0, 1fr)` track) explicitly rather than relying on clipping.

**Never zoom a sprite to make it look bigger.** `scale` on an image inside a clipping frame crops
the artwork — it cost us a round of review. Creature art always uses `object-fit: contain` at
scale 1; make it bigger by enlarging the *frame*. If a sprite still looks small, the empty space
is transparent padding baked into the asset, and the fix belongs to the display-asset pipeline
(`createCreatureDisplayAsset`, which today only downscales), not to CSS.

---

## 9. Language and accessibility

- UI copy is **Italian**. Match the existing register: short, concrete, no exclamation marks
  outside result screens.
- Every control has an accessible name: visible text, or `aria-label` on icon-only buttons.
- State goes in ARIA, not only in colour: `aria-selected`, `aria-pressed`, `aria-expanded`,
  `role="status"` / `role="alert"` with the right `aria-live`.
- Decorative art is `aria-hidden` with `alt=""`.
- Truncated text keeps the full string in `title` or the label.

---

## 10. Before you call it done

```bash
npm run dev                      # required by the audit below

npx tsc -b                       # types
npm run lint                     # oxlint
npm test                         # vitest
npm run build                    # production build
npm run assets:check             # shipped artwork is current and inside budget

# Mobile: emulates iPhone SE/12/14 Pro Max, Pixel 5, Galaxy S9+/Tab S4 with touch and DPR.
# Fails on anything escaping the viewport or its clipping ancestor, silent truncation,
# targets under 40px, and content below the fold on a surface that cannot scroll to it.
npm run audit:mobile -- battle
npm run audit:mobile -- battle safe-area
npm run audit:mobile -- battle landscape
npm run audit:mobile -- battle "sheet:.environment-card__main"
npm run audit:mobile -- draft            # the battle-start overlay
```

Routes: `/` (auth), `home`, `battle`, `profile`, `evolution`.
Modes: *(none)* · `safe-area` · `landscape` · `sheet:<css-selector>`.

**A UI change is not finished until the audit passes for every route it touches, in all three
modes, plus any overlay it can open.**

Inspect screens without a backend session with
`?ui-preview=home|battle|collection|profile|ranking|evolution|draft|transitions` (development only,
fixtures in `src/dev/ui-preview-fixtures.ts`). `draft` is the battle-start overlay over a live
battle screen; `transitions` is the motion layer of §5, and the only way to watch a screen change
without logging in.
The `evolution` route still calls the transformation API — stub `**/functions/v1/**` to reach its
later states.

To capture every preview route headless in one pass (Chromium, no session needed):

```bash
npm run dev &                            # or any port, then set PREVIEW_URL
npm run preview:shots                    # writes artifacts/preview/<route>.png
```

It fails the run on any console error or uncaught exception, so a route that renders but throws
is not a passing route.

### Known pre-existing failures

One test fails on a clean checkout. Confirm with `git stash` before assuming your change caused it.

- `supabase/functions/generate-creature-transformation/security-hardening.test.ts` fails on
  `expect(authProvider).not.toContain('.auth.signUp(')`. `AuthProvider` does call `signUp`, and
  the login screen offers "Registrati" — so either the guard is stale or public signup came back
  unintentionally. It is an auth-policy decision, not a UI bug: do not "fix" it by editing the UI.

---

## 11. Checklist

- [ ] No hex, px radius or raw spacing in a component — tokens only.
- [ ] Built from `src/ui` primitives; no primitive restyled from a screen.
- [ ] Icons from `src/ui/icons.tsx`; no emoji or text glyphs.
- [ ] Image paths from `src/ui/assets.ts`; new artwork has a spec in `tools/optimize-assets.ts`, and
      any `srcSet` carries a `sizes` that matches how big it actually renders.
- [ ] No game rule recomputed in a component.
- [ ] A new screen is registered in `src/app/screen-depth.ts`; motion animates `transform`/`opacity`
      only, off tokens, with `prefers-reduced-motion` covered by collapsing them.
- [ ] Presses get their cue from the primitive, not from a `playCue` beside the `onClick`; no
      `AudioContext` is built before a player acts.
- [ ] Touch targets ≥ 40×40; accessible names present.
- [ ] The screen's only elastic block is decorative.
- [ ] The surface owns its scrolling; the document still cannot scroll.
- [ ] `tsc` · `lint` · `test` · `build` clean.
- [ ] `audit:mobile` passes on every affected route, in all modes, overlays included.
