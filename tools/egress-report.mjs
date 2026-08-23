import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium, devices } from 'playwright-core'

/**
 * Counts what a screen actually fetches.
 *
 * Supabase's dashboard reports egress per day, aggregated across everything — enough to know that
 * Storage is 97% of it, not enough to know which screen spends it. This walks the preview routes in
 * a cold context (no HTTP cache carried between routes) and reports, per route: how many requests,
 * how many bytes, and for images the per-URL request count — because the same URL fetched twice is
 * the signature of a second consumer, and N near-identical URLs is the signature of a fan-out.
 *
 * The preview serves creature artwork from `public/`, not from Supabase, so the byte totals here
 * are a lower bound: in production each of those image requests is a signed Storage URL. The
 * request *count* and its shape are the transferable measurement.
 *
 * Usage — with a dev server already listening (see PREVIEW_URL):
 *
 *   node tools/egress-report.mjs [outputJsonPath] [route...]
 */

const BASE_URL = process.env.PREVIEW_URL ?? 'http://127.0.0.1:5173'
const EXECUTABLE_PATH = process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'
const DEVICE_NAME = process.env.PREVIEW_DEVICE ?? 'iPhone 12'
const ALL_ROUTES = ['home', 'battle', 'collection', 'profile', 'ranking', 'draft']

const [outputPath = 'artifacts/egress-report.json', ...requested] = process.argv.slice(2)
const routes = requested.length > 0 ? requested : ALL_ROUTES

function classify(url, resourceType) {
    if (resourceType === 'image' || /\.(webp|png|jpe?g|svg|avif)(\?|$)/i.test(url)) return 'image'
    if (resourceType === 'font' || /\.(woff2?|ttf)(\?|$)/i.test(url)) return 'font'
    if (resourceType === 'stylesheet' || /\.css(\?|$)/i.test(url)) return 'css'
    if (resourceType === 'script' || /\.(m?js|tsx?)(\?|$)/i.test(url)) return 'script'
    if (resourceType === 'xhr' || resourceType === 'fetch') return 'data'
    return resourceType || 'other'
}

const browser = await chromium.launch({
    executablePath: EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const contextOptions = DEVICE_NAME === 'desktop' ? { viewport: { width: 1440, height: 900 } } : devices[DEVICE_NAME]
if (!contextOptions) {
    await browser.close()
    throw new Error(`Unknown PREVIEW_DEVICE '${DEVICE_NAME}'.`)
}

const report = { device: DEVICE_NAME, routes: {} }

for (const route of routes) {
    // A fresh context per route: a warm cache would hide exactly what we are measuring.
    const context = await browser.newContext(contextOptions)
    const page = await context.newPage()
    const byType = {}
    const imageRequests = new Map()
    let requests = 0
    let bytes = 0

    page.on('requestfinished', async (request) => {
        const url = request.url()
        if (url.startsWith('data:') || url.startsWith('blob:')) return
        const type = classify(url, request.resourceType())
        let transferred = 0
        try {
            const sizes = await request.sizes()
            transferred = (sizes.responseBodySize ?? 0) + (sizes.responseHeadersSize ?? 0)
        } catch {
            transferred = 0
        }
        requests += 1
        bytes += transferred
        byType[type] = byType[type] ?? { requests: 0, bytes: 0 }
        byType[type].requests += 1
        byType[type].bytes += transferred
        if (type === 'image') {
            const key = url.replace(BASE_URL, '')
            const seen = imageRequests.get(key) ?? { count: 0, bytes: 0 }
            imageRequests.set(key, { count: seen.count + 1, bytes: seen.bytes + transferred })
        }
    })

    await page.goto(`${BASE_URL}/?ui-preview=${route}`, { waitUntil: 'networkidle', timeout: 30_000 })
    // The subject measurement loads its own copy of each sprite; give it room to finish.
    await page.waitForTimeout(2_500)
    await context.close()

    const images = [...imageRequests.entries()]
        .map(([url, value]) => ({ url, ...value }))
        .sort((left, right) => right.bytes - left.bytes)
    const refetched = images.filter((entry) => entry.count > 1)

    report.routes[route] = {
        requests,
        bytes,
        byType,
        imageUrls: images.length,
        imageRequests: byType.image?.requests ?? 0,
        refetchedImageUrls: refetched.length,
        images,
    }

    const kb = (value) => `${(value / 1024).toFixed(1)}KB`
    console.log(
        `${route.padEnd(11)} ${String(requests).padStart(3)} req  ${kb(bytes).padStart(9)}  ` +
            `images: ${byType.image?.requests ?? 0} req over ${images.length} url` +
            (refetched.length ? `  ⚠ ${refetched.length} url fetched more than once` : ''),
    )
}

await browser.close()
mkdirSync(outputPath.replace(/\/[^/]+$/, ''), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(`\nwritten to ${outputPath}`)
