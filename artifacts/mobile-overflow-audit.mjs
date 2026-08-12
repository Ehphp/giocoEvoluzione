import { chromium, devices } from 'playwright-core'

/**
 * Mobile overflow audit.
 *
 * Emulates real phones (touch input, mobile user agent, device pixel ratio) and reports every
 * element that escapes the viewport or its clipping ancestor, every string that is silently
 * truncated, every interactive target under 40px, and anything painted below the fold on a
 * surface that cannot scroll to it.
 *
 * Usage — with `npm run dev` already serving on 127.0.0.1:5173:
 *
 *   node artifacts/mobile-overflow-audit.mjs <route> [mode]
 *
 *   route  home | battle | profile | /            (a leading slash loads the real app path)
 *   mode   <empty> | safe-area | landscape | sheet:<css-selector>
 *
 * `safe-area` simulates a notched device, `landscape` swaps the viewport, and `sheet:` taps a
 * trigger before auditing so overlays are covered too.
 *
 * Requires `playwright-core` and a Chromium at CHROMIUM_PATH (defaults to /usr/bin/chromium).
 */

const BASE_URL = process.env.AUDIT_URL ?? 'http://127.0.0.1:5173'
const ROUTE = process.argv[2] ?? 'battle'
const MODE = process.argv[3] ?? ''  // '', 'safe-area', 'landscape', 'sheet:<selector>'
const DEVICE_NAMES = ['iPhone SE', 'iPhone 12', 'iPhone 14 Pro Max', 'Pixel 5', 'Galaxy S9+', 'Galaxy Tab S4']

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const findings = []

for (const deviceName of DEVICE_NAMES) {
  const descriptor = devices[deviceName]
  if (!descriptor) continue
  const base = { ...descriptor }
  if (MODE === 'landscape') {
    base.viewport = { width: base.viewport.height, height: base.viewport.width }
    base.screen = base.viewport
  }
  const context = await browser.newContext(base)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  if (MODE === 'safe-area') {
    await page.addInitScript(() => {
      const apply = () => {
        const style = document.createElement('style')
        style.textContent = ':root{--ev-safe-top:47px;--ev-safe-bottom:34px}'
        document.head.append(style)
      }
      if (document.head) apply()
      else document.addEventListener('DOMContentLoaded', apply)
    })
  }
  await page.goto(ROUTE.startsWith('/') ? `${BASE_URL}${ROUTE}` : `${BASE_URL}/?ui-preview=${ROUTE}`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(2200)
  if (MODE.startsWith('sheet:')) {
    const selector = MODE.slice(6)
    const trigger = await page.$(selector)
    if (trigger) { await trigger.tap().catch(() => {}); await page.waitForTimeout(600) }
  }

  const result = await page.evaluate(() => {
    const problems = []
    const label = (el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.')}`
    const vw = window.innerWidth
    const vh = window.innerHeight

    const isScrollable = (el) => {
      const cs = getComputedStyle(el)
      return /auto|scroll/.test(cs.overflowX + cs.overflowY)
    }
    const isHorizontallyScrollable = (el) => /auto|scroll/.test(getComputedStyle(el).overflowX)
    const hasHorizontalScroller = (el) => {
      let ancestor = el.parentElement
      while (ancestor && ancestor !== document.body) {
        if (isHorizontallyScrollable(ancestor)) return true
        ancestor = ancestor.parentElement
      }
      return false
    }
    const clips = (el) => {
      const cs = getComputedStyle(el)
      return /hidden|clip|auto|scroll/.test(cs.overflowX) || /hidden|clip|auto|scroll/.test(cs.overflowY)
    }

    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || el.classList.contains('ev-visually-hidden')) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue

      // 1. Escapes the viewport horizontally.
      // Items deliberately placed beyond the viewport inside a touch-scrollable horizontal track
      // are valid: the collection lineage uses this exact pattern.
      if (!hasHorizontalScroller(el) && (r.left < -1 || r.right > vw + 1)) {
        problems.push({ kind: 'viewport-x', el: label(el), detail: `${Math.round(r.left)}..${Math.round(r.right)} vs ${vw}` })
      }

      // 2. Its own content overflows its clipped box (hidden content).
      // `-webkit-line-clamp` and `text-overflow: ellipsis` truncate visibly and on purpose.
      const lineClamped = cs.webkitLineClamp && cs.webkitLineClamp !== 'none'
      const ellipsised = cs.textOverflow === 'ellipsis'
      if (clips(el) && !isScrollable(el) && !lineClamped && !ellipsised) {
        if (el.scrollWidth > el.clientWidth + 1) {
          problems.push({ kind: 'clipped-x', el: label(el), detail: `${el.scrollWidth} > ${el.clientWidth}` })
        }
        if (el.scrollHeight > el.clientHeight + 1) {
          problems.push({ kind: 'clipped-y', el: label(el), detail: `${el.scrollHeight} > ${el.clientHeight}` })
        }
      }

      // 3. Escapes the nearest clipping ancestor's painted box.
      let ancestor = el.parentElement
      while (ancestor && ancestor !== document.body && !clips(ancestor)) ancestor = ancestor.parentElement
      if (ancestor && ancestor !== document.body && !isScrollable(ancestor)) {
        const ar = ancestor.getBoundingClientRect()
        if (r.bottom > ar.bottom + 2 || r.top < ar.top - 2 || r.right > ar.right + 2 || r.left < ar.left - 2) {
          problems.push({ kind: 'escapes-ancestor', el: label(el), detail: `inside ${label(ancestor)}` })
        }
      }

      // 4. Interactive targets under the mobile minimum.
      if (/^(button|a|input|select)$/.test(el.tagName.toLowerCase()) && !el.disabled) {
        if (r.width < 40 || r.height < 40) {
          problems.push({ kind: 'small-target', el: label(el), detail: `${Math.round(r.width)}x${Math.round(r.height)}` })
        }
      }

      // 5. Anything painted below the fold on a surface that cannot scroll to it.
      let scrollParent = el.parentElement
      while (scrollParent && scrollParent !== document.body && !isScrollable(scrollParent)) scrollParent = scrollParent.parentElement
      const inScroller = Boolean(scrollParent && scrollParent !== document.body && isScrollable(scrollParent))
      if (r.top > vh && !inScroller) {
        problems.push({ kind: 'below-fold', el: label(el), detail: `top=${Math.round(r.top)} vh=${vh}` })
      }
    }

    return {
      viewport: `${vw}x${vh}`,
      docOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      problems,
    }
  })

  findings.push({ device: deviceName, ...result, errors })
  await context.close()
}

for (const f of findings) {
  const unique = [...new Map(f.problems.map((p) => [`${p.kind}|${p.el}|${p.detail}`, p])).values()]
  console.log(`\n${unique.length === 0 && !f.docOverflowX && f.errors.length === 0 ? 'PASS' : 'FAIL'}  ${f.device} ${f.viewport}${f.docOverflowX ? '  DOC-OVERFLOW-X' : ''}`)
  for (const p of unique.slice(0, 20)) console.log(`   ${p.kind}: ${p.el} (${p.detail})`)
  for (const e of f.errors) console.log(`   ERROR: ${e}`)
}

await browser.close()

if (findings.some((f) => f.problems.length > 0 || f.docOverflowX || f.errors.length > 0)) {
  process.exitCode = 1
}
