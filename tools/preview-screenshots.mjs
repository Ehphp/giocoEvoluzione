import { mkdirSync } from 'node:fs'
import { chromium, devices } from 'playwright-core'

/**
 * Headless capture of every UI-preview route.
 *
 * Renders the game screens from the development fixtures (`?ui-preview=<route>`), so no
 * authentication and no Supabase round-trip is needed, and writes one PNG per route.
 * Any console error or uncaught exception is reported on stderr and fails the run: a route
 * that renders but throws is not a passing route.
 *
 * Usage — with a dev server already listening (see PREVIEW_URL):
 *
 *   node tools/preview-screenshots.mjs [outputDirectory] [route...]
 *
 * Environment:
 *   PREVIEW_URL     dev server origin (default http://127.0.0.1:5173)
 *   CHROMIUM_PATH   Chromium executable (default /usr/bin/chromium)
 *   PREVIEW_DEVICE  Playwright device name (default 'iPhone 12'); 'desktop' forces 1440x900
 */

const BASE_URL = process.env.PREVIEW_URL ?? 'http://127.0.0.1:5173'
const EXECUTABLE_PATH = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'
const DEVICE_NAME = process.env.PREVIEW_DEVICE ?? 'iPhone 12'
const ALL_ROUTES = ['home', 'battle', 'collection', 'profile', 'ranking', 'evolution', 'draft']

const [outputDirectory = 'artifacts/preview', ...requestedRoutes] = process.argv.slice(2)
const routes = requestedRoutes.length > 0 ? requestedRoutes : ALL_ROUTES

mkdirSync(outputDirectory, { recursive: true })

const browser = await chromium.launch({
    executablePath: EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const contextOptions = DEVICE_NAME === 'desktop'
    ? { viewport: { width: 1440, height: 900 } }
    : devices[DEVICE_NAME]
if (!contextOptions) {
    await browser.close()
    throw new Error(`Unknown PREVIEW_DEVICE '${DEVICE_NAME}'.`)
}

let failed = 0

for (const route of routes) {
    const context = await browser.newContext(contextOptions)
    const page = await context.newPage()
    const problems = []
    page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`) })
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`))

    try {
        await page.goto(`${BASE_URL}/?ui-preview=${route}`, { waitUntil: 'networkidle', timeout: 30_000 })
        await page.waitForTimeout(1_200)
        await page.screenshot({ path: `${outputDirectory}/${route}.png`, fullPage: true })
        const heading = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim().slice(0, 90)
        if (problems.length > 0) {
            failed += 1
            console.error(`✗ ${route} — ${problems.length} problem(s)`)
            for (const problem of problems.slice(0, 5)) console.error(`    ${problem}`)
        } else {
            console.log(`✓ ${route} — ${heading}`)
        }
    } catch (error) {
        failed += 1
        console.error(`✗ ${route} — ${error instanceof Error ? error.message.split('\n')[0] : error}`)
    } finally {
        await context.close()
    }
}

await browser.close()
console.log(`\n${routes.length - failed}/${routes.length} routes rendered into ${outputDirectory}/`)
if (failed > 0) process.exitCode = 1
