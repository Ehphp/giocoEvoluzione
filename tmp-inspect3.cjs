const { chromium } = require('playwright-core')
    ; (async () => {
        const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] })
        const ctx = await browser.newContext({ viewport: { width: 412, height: 924 } })
        const page = await ctx.newPage()
        await page.goto('http://localhost:5173/?ui-preview=battle', { waitUntil: 'networkidle' })
        await page.waitForTimeout(1000)
        const val = await page.evaluate(() => {
            const el = document.querySelector('.arena__creature--player')
            return getComputedStyle(el).getPropertyValue('bottom')
        })
        console.log('lift=', val)
        await browser.close()
    })()
