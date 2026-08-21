# UI design system — "candy arena"

The interface was rebuilt from `concept.JPG`. This document records *why* the new UI looks and
behaves as it does. For the working rules — what to do and what never to do when changing UI code
— see [`AGENTS.md`](../AGENTS.md) at the repository root.

## Direction

A bright, painted mobile-game look:

- a full-bleed painted biome behind everything, lifted with a light wash so panels read on top of it;
- chunky **cream modules** with a thick light stroke, a soft inner lip and a strong drop shadow;
- **saturated gradient actions** with a bottom lip so they read as pressable toys;
- a two-team identity — **green = you**, **purple = opponent** — carried by every duel surface;
- **gold** reserved for the VS badge and the single primary call to action.

## Layers

| Layer | Location | Rule |
| --- | --- | --- |
| Tokens | `src/ui/theme.css` | The only place colours, gradients, radii, shadows, type and spacing are defined. Its top block is the brand palette — re-skinning is that block alone. |
| Assets | `src/ui/assets.ts` | Every image path the UI renders. Nothing hard-codes `/assets/...`. |
| Reset | `src/ui/base.css` | Document defaults and element normalisation. |
| Primitives | `src/ui/components.tsx` + `components.css` | `AppShell`, `Panel`, `Button`, `ActionButton`, `IconButton`, `Chip`, `Pill`, `Badge`, `Avatar`, `ProgressBar`, `Pips`, `Overlay`, `Notice`, `SectionLabel`. Screens compose them and never restyle them from outside. |
| Icons | `src/ui/icons.tsx` | Lucide, re-exported under product names, plus the hand-drawn `GeneIcon`. Screens never import `lucide-react` directly. |
| Navigation | `src/ui/Dock.tsx` | The five-slot destination bar. |
| Screens | `src/screens/*` | One folder per surface, each owning its own stylesheet. |

Everything under `src/game/`, `shared/`, `src/lib/`, `src/auth/` and
`src/components/game-v2/{controller,types,gameSelectionAssets}` is game logic and view-model
plumbing: the refactor re-wires it, it does not change it.

## Re-skinning

`src/ui/theme.css` opens with a **brand palette** block. Each colour family is three stops —
`-light`, base, `-dark` — because the look is built from three-stop gradients; edit the three
hexes and every button, card, chip and glyph that uses that family follows. Below it, a derived
section builds the gradients, strokes, shadows and scales; it rarely needs touching.

Artwork is addressed from `src/ui/assets.ts`, which maps every image the UI renders to a file
under `public/assets/` (`branding/`, `battle/`, `creatures/`, `game-ui/`). Swapping the logo, the
scenery, a gene glyph or a biome thumbnail is a one-line change there.

**Icons are always icons.** `src/ui/icons.tsx` is the only icon source: Lucide re-exported under
product names, plus `GeneIcon` for the five adaptations. Never use an emoji or a text character
(`×`, `→`, `›`) as an icon — the display face does not carry all of them and they render as tofu.

Exit controls use `IconButton variant="danger"` with `ExitIcon` when signing out of the account.
The live Battle header exposes its lower-emphasis `BackIcon` action through the player profile menu
while preserving the same confirmed match-abandonment flow. Abandoning a running match asks for
confirmation first.

## Per-gene theming

Set `data-gene="FEROCITY | ARMOR | AGILITY | SENSES | CAMOUFLAGE"` on any container and it exposes
`--gene-color`, `--gene-color-strong` and `--gene-color-soft`. Gene cards, detail sheets and round
breakdowns all colour themselves from those three variables, so adding an adaptation only means
adding one token block in `theme.css` and one glyph in `icons.tsx`.

## The dock

The bar has the five slots from the concept. Only the shipped destinations are live:

- **Battaglia** — home when there is no match, the battle surface during one;
- **Profilo** — the profile screen, enabled by `capabilities.profile`;
- **Negozio / Collezione / Classifica** — rendered locked until their capability flips to `true`.

Nothing about the layout changes when those sections ship. During a match the whole dock is locked
so a tap cannot abandon a running game; the explicit `×` in the battle header remains the way out.

## Typography

- Display (`--ev-font-display`): **Baloo 2 Variable**, weight 800 — titles, numbers, labels, buttons.
- UI (`--ev-font-ui`): **Nunito Variable**, weight 600–800 — body copy and hints.

Both are self-hosted through `@fontsource-variable`, so there is no runtime CDN dependency.

## Density and responsiveness

**Design for the real viewport, not the device spec.** A 390×844 iPhone reports roughly **390×664**
to the page once Safari's chrome is on screen, and `viewport-fit=cover` adds 47px of top inset and
34px of bottom inset on notched devices. Everything below is sized against that, not against 844.

Only one block per screen is elastic, and it is always decorative:

- **battle** — the arena (`flex: 1 1 124px; min-height: 48px`). It yields first, so the duel header,
  the briefing, the gene row and the two actions stay on screen. It is a size container, and below
  74px of its own height the sprites hide rather than shrink into specks.
  The briefing keeps its round-ahead split: the wide region is the active biome, a trailing ~24%
  column previews the next one, and either opens that biome's full affinity table.
- **home** — the creature stage (`flex: 1 1 180px`), same principle: the identity bar and the
  single call to action never move.

Height tiers then trim chrome progressively — 760px, 680px and 620px on battle; 700px and 540px on
home. Below 620px the affinity chips drop to the environment sheet, the gene level line hides, and
the carousel arrows are removed rather than shrunk under a comfortable touch target.

**The document never scrolls — surfaces do.** `html` and `body` resolve their height against the
*large* viewport, so on mobile they stay taller than the visible area while the browser chrome is
shown. That gap is what let a stray drag scroll the whole page and rubber-band back. Both root
scrollers are locked with `overflow: hidden; overscroll-behavior: none`.

Scrolling itself is untouched: it just belongs to the surface that needs it, with
`overscroll-behavior-y: contain` so it never chains back to the document.

| Surface | Scroller |
| --- | --- |
| home, profile, auth, results, evolution, system screens | `AppShell` with `scroll` |
| battle | `.battle-screen` (only when a very short viewport forces it) |
| transformation lab, background cleanup | their own root, see `technical-screens.css` |

Any new full-screen surface must go through `AppShell` or declare its own
`height: 100dvh; overflow-y: auto`, otherwise its content is unreachable.

Rules that hold everywhere:

- every interactive target is at least **40×40**;
- the environment illustrations are drawn **16:9** and framed 16:9 everywhere, so no crop ever
  cuts their composition;
- `.ev-truncate` carries `line-height: 1.4` — Baloo 2's ascenders clip against a tighter line box
  once `overflow: hidden` is set for the ellipsis;
- images inside a fixed-size frame are `display: block`, otherwise the inline baseline gap pushes
  them a few pixels past their own frame.

### Verifying

`npm run audit:mobile -- <route> [mode]` emulates iPhone SE / 12 / 14 Pro Max, Pixel 5, Galaxy S9+
and Galaxy Tab S4 with touch and device pixel ratio, then fails on any element that escapes the
viewport or its clipping ancestor, any silently truncated string, any target under 40px, and
anything painted below the fold on a surface that cannot scroll to it. Deliberate truncation —
`text-overflow: ellipsis` or `-webkit-line-clamp`, both of which show the user an ellipsis — is
not flagged; unannounced clipping is.

    npm run dev
    npm run audit:mobile -- battle
    npm run audit:mobile -- battle safe-area
    npm run audit:mobile -- home landscape
    npm run audit:mobile -- battle "sheet:.environment-card__next"

`/`, `home`, `battle` and `profile` are clean in portrait, landscape, with notch insets, and with
their overlays open.

## Development preview

`?ui-preview=home | battle | profile | evolution` renders each screen from deterministic fixtures
(`src/dev/uiPreviewFixtures.ts`) with no backend session. It is development-only and is what the
mobile audit drives. The evolution route still talks to the transformation API, so stub
`**/functions/v1/**` (and plant a session in `localStorage`) when auditing its later states.
