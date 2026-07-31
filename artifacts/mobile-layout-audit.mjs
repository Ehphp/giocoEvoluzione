import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_URL = 'http://127.0.0.1:4173'
const DEBUG_PORT = 9333
const OUTPUT_DIR = resolve('artifacts/mobile-layout-current')
const homeOnly = process.argv.includes('--home-only')
const VIEWPORTS = [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 844, height: 390 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
]

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const vitePath = resolve('node_modules/vite/bin/vite.js')
const chromeProfile = await mkdtemp(join(tmpdir(), 'gioco-evoluzione-audit-'))

let viteProcess
let chromeProcess
let socket

function delay(milliseconds) {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

async function waitFor(check, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
        try {
            const result = await check()

            if (result) {
                return result
            }
        } catch {
            // The service or browser may still be starting.
        }

        await delay(150)
    }

    throw new Error(`Timeout: ${label}`)
}

async function waitForProcessExit(process) {
    if (!process || process.exitCode !== null) {
        return
    }

    await Promise.race([
        new Promise((resolveExit) => process.once('exit', resolveExit)),
        delay(3_000),
    ])
}

async function connectToChrome() {
    const page = await waitFor(async () => {
        const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)
        const targets = await response.json()

        return targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
    }, 15_000, 'Chrome DevTools')

    socket = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((resolveOpen, rejectOpen) => {
        socket.addEventListener('open', resolveOpen, { once: true })
        socket.addEventListener('error', rejectOpen, { once: true })
    })

    let commandId = 0
    const pending = new Map()

    socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data))

        if (!message.id || !pending.has(message.id)) {
            return
        }

        const { resolveCommand, rejectCommand } = pending.get(message.id)
        pending.delete(message.id)

        if (message.error) {
            rejectCommand(new Error(message.error.message))
        } else {
            resolveCommand(message.result)
        }
    })

    return (method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
        commandId += 1
        pending.set(commandId, { resolveCommand, rejectCommand })
        socket.send(JSON.stringify({ id: commandId, method, params }))
    })
}

async function evaluate(send, expression) {
    const response = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
    })

    if (response.exceptionDetails) {
        throw new Error(response.exceptionDetails.text)
    }

    return response.result.value
}

async function waitForSelector(send, selector, timeoutMs = 20_000) {
    return waitFor(
        () => evaluate(send, `Boolean(document.querySelector(${JSON.stringify(selector)}))`),
        timeoutMs,
        selector,
    )
}

async function setViewport(send, { width, height }) {
    await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: true,
        screenWidth: width,
        screenHeight: height,
    })
}

async function collectMetrics(send, viewport) {
    return evaluate(send, `(() => {
        const selectors = [
            '.gene-selection-screen',
            '.gene-selection-screen__background',
            '.game-frame',
            '.duel-v2-header',
            '.arena-stage',
            '.event-v2-stack',
            '.event-v2-card',
            '.event-v2-next-trigger',
            '.decision-dock',
            '.selector-v2-grid',
            '.natural-advantage-v2',
            '.action-v2-panel',
            '.action-v2-btn--use',
            '.action-v2-btn--evolve',
        ]
        const boxes = Object.fromEntries(selectors.map((selector) => {
            const element = document.querySelector(selector)

            if (!element) {
                return [selector, null]
            }

            const rect = element.getBoundingClientRect()

            return [selector, {
                top: Math.round(rect.top * 10) / 10,
                bottom: Math.round(rect.bottom * 10) / 10,
                left: Math.round(rect.left * 10) / 10,
                right: Math.round(rect.right * 10) / 10,
                width: Math.round(rect.width * 10) / 10,
                height: Math.round(rect.height * 10) / 10,
                fullyVisible: rect.top >= 0 && rect.bottom <= window.innerHeight,
            }]
        }))

        return {
            requestedViewport: ${JSON.stringify(viewport)},
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            documentScrollHeight: document.documentElement.scrollHeight,
            screenScrollHeight: document.querySelector('.gene-selection-screen')?.scrollHeight ?? null,
            hasVerticalOverflow: document.documentElement.scrollHeight > window.innerHeight,
            sceneViewportRatio: (() => {
                const scene = document.querySelector('.arena-stage')?.getBoundingClientRect()
                return scene ? Math.round((scene.height / window.innerHeight) * 1000) / 10 : null
            })(),
            geneCardCount: document.querySelectorAll('.selector-v2-card').length,
            fiveGenesFullyVisible: [...document.querySelectorAll('.selector-v2-card')].length === 5
                && [...document.querySelectorAll('.selector-v2-card')].every((card) => {
                    const rect = card.getBoundingClientRect()
                    return rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight
                }),
            eventDoesNotCoverDock: (() => {
                const event = document.querySelector('.event-v2-stack')?.getBoundingClientRect()
                const dock = document.querySelector('.decision-dock')?.getBoundingClientRect()
                return Boolean(event && dock && (
                    event.right <= dock.left
                    || dock.right <= event.left
                    || event.bottom <= dock.top
                    || dock.bottom <= event.top
                ))
            })(),
            arenaHasUsefulHeight: (document.querySelector('.arena-stage')?.getBoundingClientRect().height ?? 0) > 0,
            hasFullscreenBattleBackground: Boolean(document.querySelector('.gene-selection-screen__background')),
            arenaEmbedsBattleBackground: Boolean(document.querySelector('.battle-stage__background')),
            scrollY: window.scrollY,
            boxes,
        }
    })()`)
}

function assertViewportMetrics(result) {
    const useButton = result.boxes['.action-v2-btn--use']
    const evolveButton = result.boxes['.action-v2-btn--evolve']
    const fullscreenBackground = result.boxes['.gene-selection-screen__background']
    const failures = []

    if (result.hasVerticalOverflow) failures.push('overflow verticale')
    if (!result.fiveGenesFullyVisible) failures.push('cinque geni non completamente visibili')
    if (!result.eventDoesNotCoverDock) failures.push('evento sovrapposto al dock')
    if (!result.arenaHasUsefulHeight) failures.push('arena senza altezza utile')
    if (!result.hasFullscreenBattleBackground || !fullscreenBackground?.fullyVisible) failures.push('fondale battaglia non fullscreen')
    if (result.arenaEmbedsBattleBackground) failures.push('fondale duplicato dentro l\'arena')
    if (!useButton?.fullyVisible) failures.push('USA non completamente visibile')
    if (!evolveButton?.fullyVisible) failures.push('EVOLVI non completamente visibile')

    if (failures.length) {
        throw new Error(`${result.innerWidth}x${result.innerHeight}: ${failures.join(', ')}`)
    }
}

async function collectHomeMetrics(send, viewport) {
    return evaluate(send, `(() => {
        const selectors = [
            '.home-screen',
            '.home-topbar',
            '.home-brand',
            '.home-brand__logo',
            '.home-creature-stage',
            '.home-primary-navigation__play',
        ]
        const boxes = Object.fromEntries(selectors.map((selector) => {
            const element = document.querySelector(selector)

            if (!element) {
                return [selector, null]
            }

            const rect = element.getBoundingClientRect()

            return [selector, {
                top: Math.round(rect.top * 10) / 10,
                bottom: Math.round(rect.bottom * 10) / 10,
                left: Math.round(rect.left * 10) / 10,
                right: Math.round(rect.right * 10) / 10,
                width: Math.round(rect.width * 10) / 10,
                height: Math.round(rect.height * 10) / 10,
                fullyVisible: rect.top >= 0 && rect.bottom <= window.innerHeight,
            }]
        }))

        const brand = document.querySelector('.home-brand')?.getBoundingClientRect()
        const logo = document.querySelector('.home-brand__logo')
        const logoRect = logo?.getBoundingClientRect()

        return {
            requestedViewport: ${JSON.stringify(viewport)},
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            scrollY: window.scrollY,
            documentScrollHeight: document.documentElement.scrollHeight,
            hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
            hasCreatureStage: document.querySelectorAll('[data-testid="home-creature-stage"]').length === 1,
            creatureImageCount: document.querySelectorAll('.home-creature-stage__creature').length,
            usesEmbeddedCreatureBackground: getComputedStyle(document.querySelector('.shell--home'))
                .backgroundImage.includes('battle-scene-mobile.jpeg'),
            logo: {
                alt: logo?.getAttribute('alt') ?? null,
                src: logo?.getAttribute('src') ?? null,
                objectFit: logo ? getComputedStyle(logo).objectFit : null,
                centered: Boolean(brand && logoRect && Math.abs(
                    (brand.left + brand.width / 2) - (logoRect.left + logoRect.width / 2),
                ) < 1),
            },
            boxes,
        }
    })()`)
}

function assertHomeMetrics(result) {
    const failures = []
    const logo = result.boxes['.home-brand__logo']
    const stage = result.boxes['.home-creature-stage']
    const playAction = result.boxes['.home-primary-navigation__play']

    if (result.hasHorizontalOverflow) failures.push('overflow orizzontale')
    if (result.scrollY !== 0) failures.push(`home non allineata in alto (${result.scrollY}px)`)
    if (result.documentScrollHeight > result.innerHeight + 1) failures.push(`scroll iniziale della home (${result.documentScrollHeight}px)`)
    if (!result.hasCreatureStage || result.creatureImageCount !== 1) failures.push('palco creatura non univoco')
    if (result.usesEmbeddedCreatureBackground) failures.push('fondale home con creature incorporate')
    if (!logo?.fullyVisible) failures.push('logo Evori non completamente visibile')
    if (result.logo.src !== '/assets/branding/evori-logo.png' || result.logo.alt !== 'Evori') failures.push('asset o testo alternativo del logo non corretto')
    if (result.logo.objectFit !== 'contain') failures.push('logo senza object-fit contain')
    if (!result.logo.centered) failures.push('logo non centrato')
    if (!stage?.fullyVisible) failures.push('palco creatura non completamente visibile')
    if (!playAction?.fullyVisible) {
        failures.push('CTA Gioca non completamente visibile')
    }

    if (failures.length) {
        throw new Error(`${result.innerWidth}x${result.innerHeight}: ${failures.join(', ')}`)
    }
}

async function collectResultMetrics(send, viewport) {
    return evaluate(send, `(() => {
        const selectors = [
            '.match-result-screen',
            '.match-result-hud',
            '.match-result-hero',
            '.match-result-last-round__cards',
            '.match-result-history',
            '.match-result-actions',
            '.match-result-actions__home',
            '.match-result-actions__new',
        ]
        const boxes = Object.fromEntries(selectors.map((selector) => {
            const element = document.querySelector(selector)

            if (!element) {
                return [selector, null]
            }

            const rect = element.getBoundingClientRect()

            return [selector, {
                top: Math.round(rect.top * 10) / 10,
                bottom: Math.round(rect.bottom * 10) / 10,
                left: Math.round(rect.left * 10) / 10,
                right: Math.round(rect.right * 10) / 10,
                width: Math.round(rect.width * 10) / 10,
                height: Math.round(rect.height * 10) / 10,
                fullyVisible: rect.top >= 0 && rect.bottom <= window.innerHeight,
            }]
        }))

        return {
            requestedViewport: ${JSON.stringify(viewport)},
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
            documentScrollHeight: document.documentElement.scrollHeight,
            hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
            boxes,
        }
    })()`)
}

async function reachFinishedResult(send) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        if (await evaluate(send, "Boolean(document.querySelector('.match-result-screen'))")) {
            return
        }

        await waitForSelector(send, '.gene-selection-screen', 30_000)
        const preferredAction = await evaluate(send, `(() => {
            const cards = [...document.querySelectorAll('.selector-v2-card')]
            const usableCard = cards.find((card) => !card.classList.contains('is-exhausted'))
            const targetCard = usableCard ?? cards[0]
            targetCard?.click()
            return usableCard ? 'use' : 'evolve'
        })()`)
        await delay(60)
        const submitted = await evaluate(send, `(() => {
            const action = document.querySelector('.action-v2-btn--${preferredAction}:not(:disabled)')
            action?.click()
            return Boolean(action)
        })()`)

        if (!submitted) {
            throw new Error('Nessuna azione valida disponibile durante l\'audit del risultato.')
        }

        try {
            await waitFor(
                () => evaluate(send, "Boolean(document.querySelector('.round-result-screen, .match-result-screen'))"),
                30_000,
                'risultato round o risultato finale',
            )
        } catch (error) {
            const pageText = await evaluate(send, 'document.body.innerText')
            throw new Error(`${error.message}\nTentativo ${attempt + 1}:\n${pageText}`)
        }

        if (await evaluate(send, "Boolean(document.querySelector('.match-result-screen'))")) {
            return
        }

        await waitFor(
            () => evaluate(send, "Boolean(document.querySelector('.round-result-screen .primary-button:not(:disabled)'))"),
            5_000,
            'pulsante continua risultato round',
        )
        await evaluate(send, "document.querySelector('.round-result-screen .primary-button:not(:disabled)')?.click()")
        await waitFor(
            () => evaluate(send, "!document.querySelector('.round-result-screen') && Boolean(document.querySelector('.gene-selection-screen, .match-result-screen'))"),
            30_000,
            'round successivo o risultato finale',
        )
    }

    await waitForSelector(send, '.match-result-screen', 30_000)
}

async function run() {
    await mkdir(OUTPUT_DIR, { recursive: true })

    viteProcess = spawn(process.execPath, [
        vitePath,
        '--host',
        '127.0.0.1',
        '--port',
        '4173',
        '--strictPort',
    ], {
        cwd: process.cwd(),
        stdio: 'ignore',
        windowsHide: true,
    })

    await waitFor(async () => {
        const response = await fetch(APP_URL)
        return response.ok
    }, 15_000, 'Vite')

    chromeProcess = spawn(chromePath, [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${chromeProfile}`,
        '--window-size=390,844',
        APP_URL,
    ], {
        stdio: 'ignore',
        windowsHide: true,
    })

    const send = await connectToChrome()
    await send('Page.enable')
    await send('Runtime.enable')
    await setViewport(send, VIEWPORTS[1])
    await send('Page.navigate', { url: APP_URL })
    await waitForSelector(send, '.home-primary-navigation__play')
    await waitFor(
        () => evaluate(send, "Boolean(document.querySelector('.home-brand__logo')?.complete && document.querySelector('.home-brand__logo')?.naturalWidth)"),
        20_000,
        'logo Evori',
    )

    const homeResults = []

    for (const viewport of VIEWPORTS) {
        await setViewport(send, viewport)
        await delay(150)
        await evaluate(send, 'window.scrollTo(0, 0)')

        const screenshot = await send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: false,
        })
        const filename = `home-current-${viewport.width}x${viewport.height}.png`
        await writeFile(join(OUTPUT_DIR, filename), Buffer.from(screenshot.data, 'base64'))
        const homeMetrics = { screenshot: filename, ...await collectHomeMetrics(send, viewport) }
        assertHomeMetrics(homeMetrics)
        homeResults.push(homeMetrics)
    }

    await writeFile(
        join(OUTPUT_DIR, 'home-metrics.json'),
        `${JSON.stringify(homeResults, null, 2)}\n`,
        'utf8',
    )

    await setViewport(send, VIEWPORTS[1])
    await evaluate(send, "document.querySelector('.home-primary-navigation__play')?.click()")
    await waitForSelector(send, '#player-name')

    const playModesScreenshot = await send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    })
    await writeFile(
        join(OUTPUT_DIR, 'home-play-modes-current-390x844.png'),
        Buffer.from(playModesScreenshot.data, 'base64'),
    )

    if (homeOnly) {
        await send('Browser.close')
        return
    }

    await evaluate(send, `(() => {
        const input = document.querySelector('#player-name')
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setValue.call(input, 'Layout Audit')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        const button = [...document.querySelectorAll('button')]
            .find((candidate) => candidate.textContent.includes('Gioca contro il bot'))
        button.click()
    })()`)

    try {
        await waitForSelector(send, '.gene-selection-screen', 30_000)
    } catch (error) {
        const pageText = await evaluate(send, 'document.body.innerText')
        throw new Error(`${error.message}\nPagina corrente:\n${pageText}`)
    }

    await delay(800)

    const results = []

    for (const viewport of VIEWPORTS) {
        await setViewport(send, viewport)
        await delay(250)
        await evaluate(send, 'window.scrollTo(0, 0)')

        const screenshot = await send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: false,
        })
        const filename = `choice-current-${viewport.width}x${viewport.height}.png`
        await writeFile(join(OUTPUT_DIR, filename), Buffer.from(screenshot.data, 'base64'))

        const metrics = await collectMetrics(send, viewport)
        assertViewportMetrics(metrics)
        results.push({ screenshot: filename, ...metrics })
    }

    await writeFile(
        join(OUTPUT_DIR, 'metrics.json'),
        `${JSON.stringify(results, null, 2)}\n`,
        'utf8',
    )

    for (const result of results) {
        const useButton = result.boxes['.action-v2-btn--use']
        const evolveButton = result.boxes['.action-v2-btn--evolve']
        console.log(
            `${result.innerWidth}x${result.innerHeight}: `
            + `USA=${useButton?.fullyVisible ? 'visible' : 'hidden'}, `
            + `EVOLVI=${evolveButton?.fullyVisible ? 'visible' : 'hidden'}, `
            + `overflow=${result.hasVerticalOverflow ? 'yes' : 'no'}, `
            + `scene=${result.sceneViewportRatio}%, `
            + `genes=${result.geneCardCount}, fullyVisible=${result.fiveGenesFullyVisible ? 'yes' : 'no'}, `
            + `screenHeight=${result.screenScrollHeight}`,
        )
    }

    await setViewport(send, VIEWPORTS[0])
    await evaluate(send, `document.querySelector('.event-v2-card')?.click()`)
    await delay(200)

    const currentEventDetailsMetrics = await evaluate(send, `(() => {
        const popover = document.querySelector('.event-v2-popover')
        const rect = popover?.getBoundingClientRect()

        return {
            isOpen: document.querySelector('.event-v2-card')?.getAttribute('aria-expanded') === 'true',
            compactEffectCount: document.querySelectorAll('.event-v2-effects .event-v2-chip').length,
            detailedEffectCount: popover?.querySelectorAll('.event-v2-modifier').length ?? 0,
            fullyVisible: rect
                ? rect.top >= 0
                    && rect.right <= window.innerWidth
                    && rect.bottom <= window.innerHeight
                    && rect.left >= 0
                : false,
            rect: rect ? {
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                left: rect.left,
            } : null,
        }
    })()`)
    const currentEventDetailsScreenshot = await send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    })
    await writeFile(
        join(OUTPUT_DIR, 'choice-current-event-details-360x800.png'),
        Buffer.from(currentEventDetailsScreenshot.data, 'base64'),
    )
    await writeFile(
        join(OUTPUT_DIR, 'choice-current-event-details-metrics.json'),
        `${JSON.stringify(currentEventDetailsMetrics, null, 2)}\n`,
        'utf8',
    )
    await evaluate(send, `document.querySelector('.event-v2-card')?.click()`)
    await delay(100)

    await evaluate(send, `(() => {
        const cards = document.querySelectorAll('.selector-v2-card')
        cards[cards.length - 1]?.click()
    })()`)
    await delay(250)

    const lastGeneMetrics = await evaluate(send, `(() => {
        const screen = document.querySelector('.gene-selection-screen')?.getBoundingClientRect()
        const cards = document.querySelectorAll('.selector-v2-card')
        const selectedCard = document.querySelector('.selector-v2-card[aria-selected="true"]')
        const selectedRect = selectedCard?.getBoundingClientRect()
        const selectedStyle = selectedCard ? getComputedStyle(selectedCard) : null

        return {
            innerWidth: window.innerWidth,
            scrollX: window.scrollX,
            documentScrollWidth: document.documentElement.scrollWidth,
            screenLeft: screen?.left ?? null,
            screenRight: screen?.right ?? null,
            selectedLastGene: selectedCard === cards[cards.length - 1],
            geneCardCount: cards.length,
            allGenesFullyVisible: [...cards].every((card) => {
                const rect = card.getBoundingClientRect()
                return rect.left >= 0 && rect.right <= window.innerWidth
            }),
            selectedCardRect: selectedRect ? {
                top: selectedRect.top,
                bottom: selectedRect.bottom,
                left: selectedRect.left,
                right: selectedRect.right,
            } : null,
            selectedCardOpacity: selectedStyle?.opacity ?? null,
            selectedCardVisibility: selectedStyle?.visibility ?? null,
            selectedCardFullyVisible: selectedCard
                ? selectedCard.getBoundingClientRect().left >= 0
                    && selectedCard.getBoundingClientRect().right <= window.innerWidth
                : false,
        }
    })()`)
    const lastGeneScreenshot = await send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
    })
    await writeFile(
        join(OUTPUT_DIR, 'choice-last-gene-360x800.png'),
        Buffer.from(lastGeneScreenshot.data, 'base64'),
    )
    await writeFile(
        join(OUTPUT_DIR, 'choice-last-gene-metrics.json'),
        `${JSON.stringify(lastGeneMetrics, null, 2)}\n`,
        'utf8',
    )

    await setViewport(send, VIEWPORTS[1])
    await reachFinishedResult(send)
    await delay(1_500)

    const resultScreenResults = []

    for (const viewport of VIEWPORTS) {
        await setViewport(send, viewport)
        await delay(150)
        await evaluate(send, "document.querySelector('.match-result-screen')?.scrollTo(0, 0)")

        const screenshot = await send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: false,
        })
        const filename = `result-current-${viewport.width}x${viewport.height}.png`
        await writeFile(join(OUTPUT_DIR, filename), Buffer.from(screenshot.data, 'base64'))
        resultScreenResults.push({ screenshot: filename, ...await collectResultMetrics(send, viewport) })
    }

    await writeFile(
        join(OUTPUT_DIR, 'result-metrics.json'),
        `${JSON.stringify(resultScreenResults, null, 2)}\n`,
        'utf8',
    )

    await send('Browser.close')
}

try {
    await run()
} finally {
    socket?.close()

    if (chromeProcess && !chromeProcess.killed) {
        chromeProcess.kill()
    }

    await waitForProcessExit(chromeProcess)

    if (viteProcess && !viteProcess.killed) {
        viteProcess.kill()
    }

    await waitForProcessExit(viteProcess)
    await rm(chromeProfile, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
    })
}
