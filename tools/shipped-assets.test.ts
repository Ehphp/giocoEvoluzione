import { readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * What actually reaches the store.
 *
 * `public/` is copied verbatim by Vite, so a file dropped in there ships at whatever size it happens
 * to be — no warning, no hashing, no compression. That is how a 2.3MB PNG logo sat in the bundle for
 * as long as it did. These budgets are what notices next time.
 *
 * It lives in `tools/` because it reads the filesystem, and `src/**` compiles against `vite/client`
 * rather than Node. The asset pipeline is a tool anyway, so this is where its test belongs.
 */

const PUBLIC_ASSETS = resolve(process.cwd(), 'public/assets')
const SOURCE_ROOT = resolve(process.cwd(), 'assets-source')

/** Ceilings per shipped file, in KB. Mirrors the budgets in `optimize-assets.ts`. */
const BUDGET_KB: Readonly<Record<string, number>> = {
    'branding/evori-logo.webp': 150,
    'battle/backgrounds/enchanted-forest.webp': 220,
    'battle/creatures/verdant-hatchling.webp': 90,
    'battle/creatures/amethyst-hatchling.webp': 90,
}

/** Nothing else may grow past this without a considered budget of its own. */
const UNLISTED_CEILING_KB = 60

async function walk(directory: string): Promise<string[]> {
    const found: string[] = []

    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)

        if (entry.isDirectory()) {
            found.push(...await walk(path))
        } else {
            found.push(path)
        }
    }

    return found
}

function relativeTo(root: string, path: string): string {
    return path.slice(root.length + 1).replaceAll('\\', '/')
}

async function sizeKb(path: string): Promise<number> {
    return Math.round((await stat(path)).size / 1024)
}

/**
 * The budget applies to a whole family, not one file: `evori-logo-300w.webp` and `evori-logo.webp`
 * are the same artwork at two sizes, and the widest one — which carries no suffix — is the ceiling.
 */
function familyOf(path: string): string {
    return path.replace(/-\d+w(\.\w+)$/, '$1')
}

const shipped = (await walk(PUBLIC_ASSETS)).map((path) => relativeTo(PUBLIC_ASSETS, path))

describe('shipped assets', () => {
    it('ships no raster in a legacy format', async () => {
        // WebP has covered every store-relevant OS for years, so a PNG here is an unoptimised master
        // that slipped into `public/`, not a deliberate fallback.
        expect(shipped.filter((path) => /\.(png|jpe?g)$/i.test(path))).toEqual([])
    })

    it.each(Object.entries(BUDGET_KB))('keeps %s under %iKB', async (path, budget) => {
        expect(shipped, `${path} is missing — run: npm run assets:optimize`).toContain(path)
        expect(await sizeKb(join(PUBLIC_ASSETS, path))).toBeLessThanOrEqual(budget)
    })

    it('holds every file to its family budget, or to a low ceiling if it has none', async () => {
        const oversized: string[] = []

        for (const path of shipped) {
            if (path.endsWith('.md') || path.endsWith('.txt')) continue

            const budget = BUDGET_KB[familyOf(path)] ?? UNLISTED_CEILING_KB
            const size = await sizeKb(join(PUBLIC_ASSETS, path))

            if (size > budget) {
                oversized.push(`${path} is ${size}KB, over ${budget}KB`)
            }
        }

        expect(oversized).toEqual([])
    })

    it('keeps the masters out of the served directory', async () => {
        const masters = (await walk(SOURCE_ROOT)).map((path) => relativeTo(SOURCE_ROOT, path))

        expect(masters.length).toBeGreaterThan(0)
        for (const master of masters) {
            expect(shipped).not.toContain(master)
        }
    })

    it('keeps the dev preview out of the production stylesheet', async () => {
        /*
         * Vite tree-shakes the JS of a DEV-gated route out of the bundle, but **CSS is never
         * tree-shaken**: a stylesheet imported from `src/dev/**` ships to players even though nothing
         * there can render. It happened once. Dev-only styling goes inline in the component, so it
         * leaves with the JS.
         */
        const devFiles = await walk(resolve(process.cwd(), 'src/dev'))

        expect(devFiles.filter((path) => path.endsWith('.css'))).toEqual([])
    })

    it('points the UI manifest only at files the pipeline produces', async () => {
        // A path edited in one place and not the other fails at runtime as a broken image, which is
        // exactly the kind of thing a screenshot review scrolls past.
        const manifest = await readFile(resolve(process.cwd(), 'src/ui/assets.ts'), 'utf8')
        // Every `/assets/…` literal, including the srcSet candidates — those carry a ` 300w`
        // descriptor after the path, which is dropped here so the file itself can be looked up.
        const referenced = new Set(
            [...manifest.matchAll(/'\/assets\/([^' ]+)(?: \d+w)?'/g)].map((match) => match[1]!),
        )

        expect(referenced.size).toBeGreaterThan(0)
        for (const path of referenced) {
            expect(shipped, `${path} is referenced but not shipped`).toContain(path)
        }
    })
})
