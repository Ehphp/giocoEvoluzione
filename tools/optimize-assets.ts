import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'

import sharp from 'sharp'

/**
 * Turns the artwork masters into what the app actually ships.
 *
 * `public/` is copied verbatim by Vite — no hashing, no processing — so anything left in there goes
 * to the store at whatever size it happens to be. That is how a 2.3MB PNG logo ended up in the
 * bundle. The masters therefore live outside `public/` in `assets-source/`, and this script writes
 * the derivatives that do ship.
 *
 * **WebP only, no PNG fallback and no AVIF.** WebP has been supported since iOS 14 and Android 4,
 * which is well below anything the stores will run, so a fallback would ship bytes nobody fetches.
 * AVIF compresses better but needs `<picture>` at every call site to stay safe on iOS 15, and after
 * WebP has already taken ~4.5MB off the bundle the remainder does not pay for that.
 *
 * Usage:
 *   npm run assets:optimize        rewrite every derivative
 *   npm run assets:check          fail if a derivative is missing, stale, or over budget (CI)
 */

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

type AssetSpec = Readonly<{
    /** Master, relative to `assets-source/`. */
    source: string
    /** Output stem, relative to `public/assets/`. Widths are suffixed onto it. */
    output: string
    /**
     * Widths to emit, in CSS pixels of the *widest* place the asset renders, times 1/2/3. Never
     * above the master's own width: upscaling costs bytes and buys nothing.
     */
    widths: readonly number[]
    /** Ceiling for the largest derivative, in KB. Exceeding it fails the check. */
    budgetKb: number
    /** Why these widths. Read by whoever changes them next. */
    reason: string
}>

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const SOURCE_ROOT = resolve(import.meta.dirname, '../assets-source')
const OUTPUT_ROOT = resolve(import.meta.dirname, '../public/assets')

const QUALITY = 80

const ASSETS: readonly AssetSpec[] = [
    {
        source: 'branding/evori-logo.png',
        output: 'branding/evori-logo',
        widths: [300, 600, 900],
        budgetKb: 150,
        reason: 'Widest use is 300 CSS px on the home screen (`.home-brand__logo`), so 1x/2x/3x of that.',
    },
    {
        source: 'battle/backgrounds/enchanted-forest.png',
        output: 'battle/backgrounds/enchanted-forest',
        widths: [720, 941],
        budgetKb: 220,
        reason: 'Full-bleed scenery. The master is 941 wide — already short of a DPR-3 phone — so that is the cap, and 720w is what a 320px DPR-2 phone picks. No narrower step: nothing on a store device would ever choose it, and an unfetched variant is still weight inside the app bundle.',
    },
    {
        source: 'battle/creatures/verdant-hatchling.png',
        output: 'battle/creatures/verdant-hatchling',
        widths: [250, 500],
        budgetKb: 90,
        reason: 'Sprite fallback, rendered between 54 and 176 CSS px. Two steps cover that range.',
    },
    {
        source: 'battle/creatures/amethyst-hatchling.png',
        output: 'battle/creatures/amethyst-hatchling',
        widths: [250, 500],
        budgetKb: 90,
        reason: 'Same framing and footprint as the verdant sprite.',
    },
]

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The widest derivative drops its suffix, so `ASSETS` in the UI manifest can point at a stable path
 * and `srcSetFor` supplies the rest. A browser ignoring `srcSet` then gets the full-quality file.
 */
function outputPath(spec: AssetSpec, width: number): string {
    const isWidest = width === Math.max(...spec.widths)

    return join(OUTPUT_ROOT, `${spec.output}${isWidest ? '' : `-${width}w`}.webp`)
}

async function fileSize(path: string): Promise<number | null> {
    try {
        return (await stat(path)).size
    } catch {
        return null
    }
}

async function render(spec: AssetSpec, width: number): Promise<Buffer> {
    const master = sharp(await readFile(join(SOURCE_ROOT, spec.source)))
    const { width: masterWidth } = await master.metadata()

    if (masterWidth && width > masterWidth) {
        throw new Error(`${spec.source}: asked for ${width}w from a ${masterWidth}w master. Upscaling is never the answer.`)
    }

    return master
        .resize({ width, withoutEnlargement: true })
        // `effort: 6` is the slow end of WebP's encoder. This runs by hand, not per build.
        .webp({ quality: QUALITY, effort: 6 })
        .toBuffer()
}

/** Every `.webp` currently under `public/assets`, so orphans left by a renamed spec are visible. */
async function existingDerivatives(directory: string): Promise<string[]> {
    const found: string[] = []

    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)

        if (entry.isDirectory()) {
            found.push(...await existingDerivatives(path))
        } else if (entry.name.endsWith('.webp')) {
            found.push(path)
        }
    }

    return found
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

const isCheckOnly = process.argv.includes('--check')
const problems: string[] = []
const expected = new Set<string>()

for (const spec of ASSETS) {
    for (const width of spec.widths) {
        const target = outputPath(spec, width)
        expected.add(target)

        const rendered = await render(spec, width)
        const isWidest = width === Math.max(...spec.widths)
        const sizeKb = Math.round(rendered.byteLength / 1024)

        if (isWidest && sizeKb > spec.budgetKb) {
            problems.push(`${relative(OUTPUT_ROOT, target)} is ${sizeKb}KB, over its ${spec.budgetKb}KB budget.`)
        }

        if (isCheckOnly) {
            const onDisk = await fileSize(target)

            if (onDisk === null) {
                problems.push(`${relative(OUTPUT_ROOT, target)} is missing. Run: npm run assets:optimize`)
            } else if (onDisk !== rendered.byteLength) {
                problems.push(`${relative(OUTPUT_ROOT, target)} is stale. Run: npm run assets:optimize`)
            }

            continue
        }

        await mkdir(dirname(target), { recursive: true })
        await writeFile(target, rendered)
        console.log(`${relative(OUTPUT_ROOT, target).padEnd(48)} ${String(width).padStart(4)}w  ${String(sizeKb).padStart(4)}KB`)
    }
}

for (const orphan of await existingDerivatives(OUTPUT_ROOT)) {
    if (!expected.has(orphan)) {
        problems.push(`${relative(OUTPUT_ROOT, orphan)} is not produced by any spec. Delete it or add its spec.`)
    }
}

if (problems.length > 0) {
    console.error(`\n${problems.length} problem(s):`)
    for (const problem of problems) {
        console.error(`  - ${problem}`)
    }
    process.exit(1)
}

console.log(isCheckOnly ? '\nEvery derivative is present, current and inside budget.' : '\nDone.')
