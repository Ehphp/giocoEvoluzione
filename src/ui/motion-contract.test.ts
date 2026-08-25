import { describe, expect, it } from 'vitest'

import battle from '../screens/battle/BattleScreen.css?raw'
import components from './components.css?raw'
import home from '../screens/home/HomeScreen.css?raw'
import screenTransition from './screen-transition.css?raw'
import theme from './theme.css?raw'

/**
 * Assertions against the stylesheets themselves.
 *
 * Unusual, and deliberate: the invariants below fail *silently*. A press that shares one timing
 * between going down and coming back still works, still looks fine in a screenshot, and just feels
 * dead. A variant override that drifts above the base `:active` rule loses to it, because they carry
 * equal specificity and only order separates them — nothing warns, the lip simply stops compressing.
 * jsdom applies none of this CSS, so the text is what can be held to account.
 *
 * `?raw` rather than `node:fs`: `src/**` compiles against `vite/client`, not Node, and this way the
 * test resolves the stylesheet through the same imports the app does.
 */

/** The declaration block for a selector, so a rule can be asserted without matching whitespace. */
function block(css: string, selector: string): string {
    const index = css.indexOf(`${selector} {`)
    expect(index, `selector not found: ${selector}`).toBeGreaterThanOrEqual(0)

    return css.slice(index, css.indexOf('}', index))
}

describe('press feel', () => {
    it('goes down on one timing and comes back on another', () => {
        const rest = block(components, '.ev-btn')
        const held = block(components, '.ev-btn:active:not(:disabled)')

        // The asymmetry *is* the feel: a single shared timing is the bug this guards.
        expect(rest).toContain('var(--ev-dur-release) var(--ev-ease-spring)')
        expect(held).toContain('var(--ev-dur-press) var(--ev-ease)')
        expect(held).not.toContain('--ev-ease-spring')
    })

    it('compresses the lip rather than moving it', () => {
        const held = block(components, '.ev-btn:active:not(:disabled)')

        expect(held).toContain('var(--ev-lip-pressed)')
        expect(held).toContain('translateY(var(--ev-press-sink))')
        expect(held).toContain('scale(var(--ev-press-scale))')
    })

    it.each([
        ['.ev-btn--cream:active:not(:disabled)'],
        ['.ev-btn--ghost:active:not(:disabled)'],
    ])('keeps %s after the base rule it has to beat on order alone', (selector) => {
        const base = components.indexOf('.ev-btn:active:not(:disabled) {')
        const override = components.indexOf(`${selector} {`)

        expect(override).toBeGreaterThan(base)
    })

    it('gives the pressables that are not buttons the same curves', () => {
        // A second press feel is a second visual system, so these must read from the same tokens.
        const draft = block(battle, '.evolution-draft__option:active:not(:disabled)')

        expect(draft).toContain('var(--ev-dur-press)')
        expect(draft).toContain('var(--ev-press-sink)')
        expect(draft).toContain('var(--ev-lip-cream-pressed)')
    })

    it('springs every property a selected gene orb moves on', () => {
        /*
         * The orb grows by `scale` alone — `transform-origin` at its foot is what makes it rise
         * instead of needing a translate, so the name below never moves. Whatever the selection
         * animates has to carry the release curve: a second property on a different curve visibly
         * disagrees with the first.
         */
        const disc = block(battle, '.gene-orb__disc')

        expect(disc).toContain('scale var(--ev-dur-release) var(--ev-ease-spring)')
        expect(disc).toContain('transform-origin: 50% 100%')
        expect(block(battle, '.gene-orb:active:not(:disabled) .gene-orb__disc')).toContain('var(--ev-dur-press)')
    })
})

describe('stable layout', () => {
    it('gives the round decision a definite height, not a floor', () => {
        /*
         * `min-height` is the bug, not the fix. The action hint says something different for every
         * adaptation and the decision sits under the one elastic block on the battle screen, so a box
         * that could grow with its copy moved the arena and the creatures jumped as the player walked
         * the gene row. Flooring the *hint* instead only shrank the jump to a pixel — two line boxes
         * measure 26px where `font-size * line-height * 2` computes 25px, because the browser rounds
         * each line. A definite height on the button is what ends it: nothing inside can move anything
         * outside, whatever the copy turns out to be.
         */
        const action = block(components, '.ev-action-btn')

        expect(action).toContain('height: var(--ev-action-btn-height)')
        expect(action).not.toContain('min-height')

        // And a shorter button has to ask for less prose rather than clip it.
        const hint = block(components, '.ev-action-btn__hint')
        expect(hint).toContain('-webkit-line-clamp: var(--ev-action-btn-hint-lines)')
        expect(hint).not.toContain('min-height')
        expect(battle).toContain('--ev-action-btn-hint-lines: 1')
    })
})

describe('stage sizing', () => {
    it('keeps the forms rail from inflating the column the creature is measured against', () => {
        /*
         * The rail and the artwork share a grid column. An implicit `auto` track is sized by its
         * widest item's max-content, and the rail's max-content is every unlocked form laid side by
         * side — so a long lineage stretched the column far past the viewport, the artwork inherited
         * that width through `width: 100%`, and `100cqw` stopped bounding anything. The fitted sprite
         * rendered enormous and ran off the right edge. A `1fr` track with a zero minimum cannot be
         * inflated from inside it. Nothing about this is visible in jsdom, hence the text.
         */
        expect(block(home, '.home-stage')).toContain('grid-template-columns: minmax(0, 1fr)')
        expect(block(home, '.home-forms')).toContain('overflow-x: auto')
        // `max-width` was the bug's disguise: it resolved against the track the rail had inflated.
        expect(block(home, '.home-forms')).not.toContain('max-width')
    })

    it('bounds the unmeasured sprite by the padded box, not the box around it', () => {
        // An absolute box resolves against its containing block's *padding* box, so the slide's
        // padding has to come off by hand or the sprite jumps size the moment the measurement lands.
        const creature = block(home, '.home-stage__creature')

        expect(creature).toContain('inset: var(--home-slide-pad)')
        expect(creature).toContain('calc(100% - var(--home-slide-pad) * 2)')
    })
})

describe('gene level frames', () => {
    /*
     * Level is carried by studs set into the orb's ring, one per level. It has no text anywhere on the
     * token, so if the stylesheet stops distinguishing a level the information is simply gone — which
     * already happened once, when only level 2 had a frame and a raw adaptation looked identical to an
     * evolved one. `MAX_ADAPTATION_LEVEL` is 2 and levels start at 0, so all three need a rule.
     */
    it('gives every level a different number of studs', () => {
        const studCount = (level: number) => [
            `.gene-orb[data-level='${level}'] .gene-orb__frame::before`,
            `.gene-orb[data-level='${level}'] .gene-orb__frame::after`,
        ].filter((selector) => battle.includes(`${selector} {`)).length

        expect(studCount(0)).toBe(0)
        expect(studCount(1)).toBe(1)
        expect(studCount(2)).toBe(2)
    })

    it('keeps the studs on the ring at whatever size the orb takes', () => {
        // Offsets are `radius x (cos, -sin)` written against the size token, never fixed pixels: the
        // orb shrinks on small screens and the studs have to shrink onto the new ring with it.
        const studs = battle.slice(battle.indexOf(".gene-orb[data-level='1'] .gene-orb__frame::after"))
            .slice(0, battle.indexOf('.gene-orb__score') - battle.indexOf(".gene-orb[data-level='1'] .gene-orb__frame::after"))

        expect(studs).toContain('var(--ev-gene-orb-size) * -.354')
        expect(studs).toContain('var(--ev-gene-orb-size) * -.433')
        expect(studs).not.toMatch(/translate:\s*calc\(-50% [+-] \d+px/)
    })

    it('reserves the selected orb\'s growth from the tokens that cause it', () => {
        /*
         * The disc grows by `scale` from its foot, so it overflows its container upward by exactly the
         * delta. A hard-coded reservation drifted out of step with the scale and pushed the orb into
         * the matchup strip; deriving it keeps the two locked together.
         */
        const orbs = block(battle, '.gene-orbs')

        expect(orbs).toContain('var(--ev-gene-orb-size) * (var(--ev-gene-orb-selected-scale) - 1)')
        // And the height tiers must retune the size on the container, or the reservation keeps the old one.
        expect(battle).not.toMatch(/\.gene-orb \{\s*--ev-gene-orb-size/)
    })
})

describe('list stagger', () => {
    it('leaves no row holding a transform once it lands', () => {
        // `both` would make every row a containing block for anything positioned to the viewport.
        expect(block(components, '.ev-stagger > *')).toContain('backwards')
        expect(block(components, '.ev-stagger > *')).not.toContain('both')
    })

    it('caps the cascade so a long list arrives instead of trickling', () => {
        const base = block(components, '.ev-stagger > *')

        expect(base).toContain('animation-delay: var(--ev-stagger-max)')
        // Enumerated positions override the cap; everything past them shares it.
        expect(components).toContain('.ev-stagger > *:nth-child(10)')
    })
})

describe('screen moves', () => {
    it('animates nothing but transform and opacity, because it repaints the whole viewport', () => {
        const keyframes = screenTransition.slice(screenTransition.indexOf('@keyframes'))
        const animated = new Set(
            [...keyframes.matchAll(/^\s+([a-z-]+):/gm)].map((match) => match[1]!),
        )

        expect(animated).toEqual(new Set(['opacity', 'transform']))
    })
})

describe('reduced motion', () => {
    it('collapses every motion token it introduces, travel included', () => {
        const reduced = theme.slice(theme.indexOf('@media (prefers-reduced-motion: reduce)'))

        for (const token of [
            '--ev-dur-screen',
            '--ev-screen-shift',
            '--ev-screen-bloom',
            '--ev-dur-press',
            '--ev-dur-release',
            '--ev-stagger-step',
            '--ev-stagger-max',
            '--ev-stagger-rise',
        ]) {
            expect(reduced, token).toContain(token)
        }
    })

    it('keeps the press readable — the sink and the squash survive, only the spring goes', () => {
        const reduced = theme.slice(theme.indexOf('@media (prefers-reduced-motion: reduce)'))

        // Direct manipulation is what reduced motion exempts: the control must still say it was hit.
        expect(reduced).not.toContain('--ev-press-sink')
        expect(reduced).not.toContain('--ev-press-scale')
    })
})
