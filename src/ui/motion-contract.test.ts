import { describe, expect, it } from 'vitest'

import battle from '../screens/battle/BattleScreen.css?raw'
import components from './components.css?raw'
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

    it('springs both properties a selected gene card moves on', () => {
        // `scale` is separate from the `translateY` here: one curve without the other visibly disagrees.
        const card = block(battle, '.gene-card')

        expect(card).toContain('transform var(--ev-dur-release) var(--ev-ease-spring)')
        expect(card).toContain('scale var(--ev-dur-release) var(--ev-ease-spring)')
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
