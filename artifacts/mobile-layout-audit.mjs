import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_URL = 'http://127.0.0.1:4173'
const DEBUG_PORT = 9333
const OUTPUT_DIR = resolve('artifacts/mobile-layout-current')
const VIEWPORTS = [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
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
            '.screen-content',
            '.event-v2-card',
            '.next-event-v2-section',
            '.next-event-v2-card',
            '.gene-selector-panel',
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
            scrollY: window.scrollY,
            boxes,
        }
    })()`)
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
    await waitForSelector(send, '#player-name')

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
        await evaluate(send, `document.querySelector('[data-testid="gene-v2-scroll-container"]')?.scrollTo(0, 0)`)

        const screenshot = await send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: false,
        })
        const filename = `choice-current-${viewport.width}x${viewport.height}.png`
        await writeFile(join(OUTPUT_DIR, filename), Buffer.from(screenshot.data, 'base64'))

        const metrics = await collectMetrics(send, viewport)
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
            + `screenHeight=${result.screenScrollHeight}`,
        )
    }

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
