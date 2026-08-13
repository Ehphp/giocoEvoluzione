import type { CreatureRenderSpecification } from './render-specifications.ts'

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const DEFAULT_MIN_BYTES = 64
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

export type ImageValidationProblemCode =
    | 'IMAGE_EMPTY'
    | 'MIME_TYPE_INVALID'
    | 'PNG_BYTES_TOO_SMALL'
    | 'PNG_BYTES_TOO_LARGE'
    | 'PNG_SIGNATURE_INVALID'
    | 'PNG_STRUCTURE_INVALID'
    | 'PNG_IHDR_MISSING'
    | 'PNG_DIMENSIONS_INVALID'
    | 'PNG_COLOR_TYPE_UNSUPPORTED'
    | 'PNG_ALPHA_REQUIRED'
    | 'PNG_ALPHA_COVERAGE_INVALID'
    | 'FLUX_SUBJECT_CROPPED'
    | 'PNG_FOREGROUND_DETECTION_FAILED'
    | 'RESULT_IMAGE_UNCHANGED'
    | 'SHA256_UNAVAILABLE'

export type ImageValidationWarningCode = 'RESULT_IMAGE_UNCHANGED_MOCK'

export type ImageValidationProblem = {
    code: ImageValidationProblemCode
    message: string
    path?: string
}

export type ValidatedPngMetadata = {
    mimeType: 'image/png'
    width: number
    height: number
    colorType: number
    hasAlpha: boolean
    transparentPixelRatio?: number
    visiblePixelRatio?: number
    foregroundBounds?: ForegroundBounds
    sha256: string
    bytes: number
}

export type ForegroundBounds = Readonly<{
    left: number
    top: number
    right: number
    bottom: number
    marginLeft: number
    marginTop: number
    marginRight: number
    marginBottom: number
}>

export type ImageValidationResult =
    | { valid: true; metadata: ValidatedPngMetadata; warnings: ImageValidationWarningCode[] }
    | { valid: false; problems: ImageValidationProblem[] }

export type ImageValidationInput = Readonly<{
    bytes: Uint8Array
    mimeType: string
    renderSpecification: Pick<CreatureRenderSpecification, 'width' | 'height'>
    sourceSha256?: string
    isMock?: boolean
    minBytes?: number
    maxBytes?: number
    requireAlpha?: boolean
    requireAlphaCoverage?: boolean
    requireTransparentEdges?: boolean
    /** Reject an opaque FLUX render whose detected subject enters this canvas margin. */
    requireSubjectMargin?: boolean | number
}>

function problem(code: ImageValidationProblemCode, message: string): ImageValidationProblem {
    return { code, message }
}

function readUint32(bytes: Uint8Array, offset: number): number {
    return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0
}

function hasPngSignature(bytes: Uint8Array): boolean {
    return PNG_SIGNATURE.every((value, index) => bytes[index] === value)
}

function isCompatibleColorType(colorType: number, bitDepth: number): boolean {
    if (colorType === 0) return [1, 2, 4, 8, 16].includes(bitDepth)
    if (colorType === 2 || colorType === 4 || colorType === 6) return [8, 16].includes(bitDepth)
    if (colorType === 3) return [1, 2, 4, 8].includes(bitDepth)
    return false
}

async function alphaCoverage(input: { compressedIdat: Uint8Array; width: number; height: number; colorType: number; bitDepth: number }) {
    if ((input.colorType !== 4 && input.colorType !== 6) || input.bitDepth !== 8 || typeof DecompressionStream === 'undefined') {
        throw new Error('Il PNG non contiene un canale alpha RGBA/GA a 8 bit decodificabile.')
    }
    const bytesPerPixel = input.colorType === 6 ? 4 : 2
    const stride = input.width * bytesPerPixel
    const compressedCopy = new Uint8Array(input.compressedIdat.length)
    compressedCopy.set(input.compressedIdat)
    const stream = new Response(compressedCopy).body
    if (!stream) throw new Error('Lo stream PNG non e disponibile.')
    const decoded = new Uint8Array(await new Response(stream.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())
    if (decoded.length !== input.height * (stride + 1)) throw new Error('La dimensione dei pixel PNG decompressi non e valida.')

    let offset = 0
    let previous = new Uint8Array(stride)
    let transparent = 0
    let visible = 0
    let edgeTransparent = 0
    let edgePixels = 0
    let cornerTransparent = 0
    let cornerPixels = 0
    const border = Math.max(1, Math.floor(Math.min(input.width, input.height) * 0.02))
    const cornerWidth = Math.max(1, Math.floor(input.width * 0.05))
    const cornerHeight = Math.max(1, Math.floor(input.height * 0.05))
    const total = input.width * input.height
    for (let row = 0; row < input.height; row += 1) {
        const filter = decoded[offset]
        offset += 1
        const scanline = decoded.slice(offset, offset + stride)
        offset += stride
        for (let index = 0; index < stride; index += 1) {
            const left = index >= bytesPerPixel ? scanline[index - bytesPerPixel] : 0
            const above = previous[index]
            const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0
            if (filter === 1) scanline[index] = (scanline[index] + left) & 0xff
            else if (filter === 2) scanline[index] = (scanline[index] + above) & 0xff
            else if (filter === 3) scanline[index] = (scanline[index] + Math.floor((left + above) / 2)) & 0xff
            else if (filter === 4) {
                const p = left + above - upperLeft
                const pa = Math.abs(p - left); const pb = Math.abs(p - above); const pc = Math.abs(p - upperLeft)
                scanline[index] = (scanline[index] + (pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft)) & 0xff
            } else if (filter !== 0) throw new Error('Il filtro PNG non e supportato.')
        }
        const alphaOffset = input.colorType === 6 ? 3 : 1
        for (let pixel = 0; pixel < input.width; pixel += 1) {
            const alpha = scanline[pixel * bytesPerPixel + alphaOffset]
            if (alpha < 255) transparent += 1
            if (alpha >= 128) visible += 1
            const isEdge = row < border || row >= input.height - border || pixel < border || pixel >= input.width - border
            if (isEdge) {
                edgePixels += 1
                if (alpha < 255) edgeTransparent += 1
            }
            const isCorner = (row < cornerHeight || row >= input.height - cornerHeight)
                && (pixel < cornerWidth || pixel >= input.width - cornerWidth)
            if (isCorner) {
                cornerPixels += 1
                if (alpha < 255) cornerTransparent += 1
            }
        }
        previous = scanline
    }
    return {
        transparentPixelRatio: transparent / total,
        visiblePixelRatio: visible / total,
        edgeTransparentPixelRatio: edgeTransparent / edgePixels,
        cornerTransparentPixelRatio: cornerTransparent / cornerPixels,
    }
}

async function inflatePngIdat(compressedIdat: Uint8Array): Promise<Uint8Array> {
    if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream non disponibile.')
    const copy = new Uint8Array(compressedIdat.length)
    copy.set(compressedIdat)
    const stream = new Response(copy).body
    if (!stream) throw new Error('Lo stream PNG non e disponibile.')
    return new Uint8Array(await new Response(stream.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())
}

function restorePngScanline(scanline: Uint8Array, previous: Uint8Array, filter: number, bytesPerPixel: number): void {
    for (let index = 0; index < scanline.length; index += 1) {
        const left = index >= bytesPerPixel ? scanline[index - bytesPerPixel] : 0
        const above = previous[index]
        const upperLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] : 0
        if (filter === 1) scanline[index] = (scanline[index] + left) & 0xff
        else if (filter === 2) scanline[index] = (scanline[index] + above) & 0xff
        else if (filter === 3) scanline[index] = (scanline[index] + Math.floor((left + above) / 2)) & 0xff
        else if (filter === 4) {
            const p = left + above - upperLeft
            const pa = Math.abs(p - left); const pb = Math.abs(p - above); const pc = Math.abs(p - upperLeft)
            scanline[index] = (scanline[index] + (pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft)) & 0xff
        } else if (filter !== 0) throw new Error('Il filtro PNG non e supportato.')
    }
}

function median(values: number[]): number {
    values.sort((left, right) => left - right)
    return values[Math.floor(values.length / 2)] ?? 0
}

/** FLUX raw renders have a flat background, so corner colour outliers form the subject mask. */
async function foregroundBounds(input: { compressedIdat: Uint8Array; width: number; height: number; colorType: number; bitDepth: number; interlaceMethod: number }): Promise<ForegroundBounds> {
    if (!([2, 6].includes(input.colorType)) || input.bitDepth !== 8 || input.interlaceMethod !== 0) throw new Error('Il RAW FLUX deve essere RGB/RGBA 8-bit non interlacciato per verificare il framing.')
    const bytesPerPixel = input.colorType === 6 ? 4 : 3
    const stride = input.width * bytesPerPixel
    const decoded = await inflatePngIdat(input.compressedIdat)
    if (decoded.length !== input.height * (stride + 1)) throw new Error('La dimensione dei pixel PNG decompressi non e valida.')
    const rows: Uint8Array[] = []
    let offset = 0
    let previous = new Uint8Array(stride)
    for (let y = 0; y < input.height; y += 1) {
        const filter = decoded[offset++]!
        const row = decoded.slice(offset, offset + stride)
        offset += stride
        restorePngScanline(row, previous, filter, bytesPerPixel)
        rows.push(row)
        previous = row
    }

    const patchWidth = Math.max(2, Math.floor(input.width * 0.04))
    const patchHeight = Math.max(2, Math.floor(input.height * 0.04))
    const red: number[] = []; const green: number[] = []; const blue: number[] = []
    for (const yStart of [0, input.height - patchHeight]) for (const xStart of [0, input.width - patchWidth]) {
        for (let y = yStart; y < yStart + patchHeight; y += 2) for (let x = xStart; x < xStart + patchWidth; x += 2) {
            const pixel = x * bytesPerPixel; const row = rows[y]!
            red.push(row[pixel]!); green.push(row[pixel + 1]!); blue.push(row[pixel + 2]!)
        }
    }
    const background = [median(red), median(green), median(blue)]
    const total = input.width * input.height
    const foreground = new Uint8Array(total)
    for (let y = 0; y < input.height; y += 1) for (let x = 0; x < input.width; x += 1) {
        const pixel = x * bytesPerPixel; const row = rows[y]!
        const alpha = input.colorType === 6 ? row[pixel + 3]! : 255
        const distance = (row[pixel]! - background[0]!) ** 2 + (row[pixel + 1]! - background[1]!) ** 2 + (row[pixel + 2]! - background[2]!) ** 2
        if (alpha >= 128 && distance >= 24 * 24) foreground[y * input.width + x] = 1
    }

    const queue = new Int32Array(total)
    const minimumComponentPixels = Math.max(6, Math.ceil(total * 0.000005))
    let left = input.width; let top = input.height; let right = -1; let bottom = -1
    for (let start = 0; start < total; start += 1) {
        if (!foreground[start]) continue
        let head = 0; let tail = 0; let pixels = 0
        let componentLeft = input.width; let componentTop = input.height; let componentRight = -1; let componentBottom = -1
        foreground[start] = 0; queue[tail++] = start
        while (head < tail) {
            const current = queue[head++]!
            const x = current % input.width; const y = Math.floor(current / input.width)
            pixels += 1; componentLeft = Math.min(componentLeft, x); componentTop = Math.min(componentTop, y); componentRight = Math.max(componentRight, x); componentBottom = Math.max(componentBottom, y)
            for (const next of [current - 1, current + 1, current - input.width, current + input.width]) {
                if (next < 0 || next >= total) continue
                const nextX = next % input.width
                if (Math.abs(nextX - x) > 1 || !foreground[next]) continue
                foreground[next] = 0; queue[tail++] = next
            }
        }
        if (pixels >= minimumComponentPixels) {
            left = Math.min(left, componentLeft); top = Math.min(top, componentTop); right = Math.max(right, componentRight); bottom = Math.max(bottom, componentBottom)
        }
    }
    if (right < 0) throw new Error('Non e stato rilevato un soggetto distinto dallo sfondo RAW FLUX.')
    return { left, top, right, bottom, marginLeft: left, marginTop: top, marginRight: input.width - 1 - right, marginBottom: input.height - 1 - bottom }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    if (!globalThis.crypto?.subtle) throw new Error('Web Crypto SubtleCrypto non disponibile.')
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.slice().buffer)
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export class ImageValidator {
    async validate(input: ImageValidationInput): Promise<ImageValidationResult> {
        const problems: ImageValidationProblem[] = []
        const minBytes = input.minBytes ?? DEFAULT_MIN_BYTES
        const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES

        if (!input.bytes.length) problems.push(problem('IMAGE_EMPTY', 'L immagine non contiene byte.'))
        if (input.mimeType !== 'image/png') problems.push(problem('MIME_TYPE_INVALID', 'Il MIME type dell immagine deve essere image/png.'))
        if (input.bytes.length && input.bytes.length < minBytes) problems.push(problem('PNG_BYTES_TOO_SMALL', 'Il PNG e troppo piccolo per essere una sorgente valida.'))
        if (input.bytes.length > maxBytes) problems.push(problem('PNG_BYTES_TOO_LARGE', 'Il PNG supera il limite di dimensione consentito.'))
        if (input.bytes.length >= PNG_SIGNATURE.length && !hasPngSignature(input.bytes)) {
            problems.push(problem('PNG_SIGNATURE_INVALID', 'La firma PNG non e valida.'))
        }
        if (input.bytes.length < PNG_SIGNATURE.length) {
            problems.push(problem('PNG_SIGNATURE_INVALID', 'I byte non contengono una firma PNG completa.'))
        }
        if (problems.length) return { valid: false, problems }

        let offset = PNG_SIGNATURE.length
        let ihdr: { width: number; height: number; bitDepth: number; colorType: number; interlaceMethod: number } | null = null
        let sawIdat = false
        let sawIend = false
        let sawTransparency = false
        const idatParts: Uint8Array[] = []
        let structureInvalid = false

        while (offset < input.bytes.length) {
            if (offset + 12 > input.bytes.length) {
                structureInvalid = true
                break
            }
            const length = readUint32(input.bytes, offset)
            const chunkType = String.fromCharCode(...input.bytes.slice(offset + 4, offset + 8))
            const dataStart = offset + 8
            const dataEnd = dataStart + length
            const chunkEnd = dataEnd + 4
            if (dataEnd < dataStart || chunkEnd > input.bytes.length) {
                structureInvalid = true
                break
            }

            if (chunkType === 'IHDR') {
                if (ihdr || length !== 13 || offset !== PNG_SIGNATURE.length) {
                    structureInvalid = true
                    break
                }
                ihdr = {
                    width: readUint32(input.bytes, dataStart),
                    height: readUint32(input.bytes, dataStart + 4),
                    bitDepth: input.bytes[dataStart + 8],
                    colorType: input.bytes[dataStart + 9],
                    interlaceMethod: input.bytes[dataStart + 12],
                }
                if (input.bytes[dataStart + 10] !== 0 || input.bytes[dataStart + 11] !== 0 || ![0, 1].includes(input.bytes[dataStart + 12])) {
                    structureInvalid = true
                    break
                }
            } else if (chunkType === 'IDAT') {
                sawIdat = sawIdat || length > 0
                if (length) idatParts.push(input.bytes.slice(dataStart, dataEnd))
            } else if (chunkType === 'tRNS') {
                sawTransparency = true
            } else if (chunkType === 'IEND') {
                if (length !== 0 || chunkEnd !== input.bytes.length) structureInvalid = true
                sawIend = true
                break
            }
            offset = chunkEnd
        }

        if (!ihdr) problems.push(problem('PNG_IHDR_MISSING', 'Il PNG non contiene un chunk IHDR valido.'))
        if (structureInvalid || !sawIend || !sawIdat) problems.push(problem('PNG_STRUCTURE_INVALID', 'La struttura dei chunk PNG non e sufficientemente leggibile.'))
        if (ihdr && (ihdr.width !== input.renderSpecification.width || ihdr.height !== input.renderSpecification.height)) {
            problems.push(problem('PNG_DIMENSIONS_INVALID', `Il canvas PNG deve essere ${input.renderSpecification.width}x${input.renderSpecification.height}.`))
        }
        if (ihdr && !isCompatibleColorType(ihdr.colorType, ihdr.bitDepth)) {
            problems.push(problem('PNG_COLOR_TYPE_UNSUPPORTED', 'Il color type PNG non e compatibile con la pipeline.'))
        }
        const hasAlpha = Boolean(ihdr && (ihdr.colorType === 4 || ihdr.colorType === 6 || sawTransparency))
        if (ihdr && input.requireAlpha !== false && !hasAlpha) problems.push(problem('PNG_ALPHA_REQUIRED', 'Il PNG deve dichiarare un canale alpha o un chunk tRNS.'))
        if (problems.length) return { valid: false, problems }

        let coverage: { transparentPixelRatio: number; visiblePixelRatio: number; edgeTransparentPixelRatio: number; cornerTransparentPixelRatio: number } | null = null
        if (input.requireAlphaCoverage || input.requireTransparentEdges) {
            try {
                const length = idatParts.reduce((total, part) => total + part.length, 0)
                const compressed = new Uint8Array(length)
                let cursor = 0
                for (const part of idatParts) { compressed.set(part, cursor); cursor += part.length }
                coverage = await alphaCoverage({ compressedIdat: compressed, width: ihdr!.width, height: ihdr!.height, colorType: ihdr!.colorType, bitDepth: ihdr!.bitDepth })
                if (input.requireAlphaCoverage && (coverage.transparentPixelRatio < 0.005 || coverage.visiblePixelRatio < 0.01 || coverage.visiblePixelRatio > 0.98)) {
                    problems.push(problem('PNG_ALPHA_COVERAGE_INVALID', 'Il PNG deve contenere sia un soggetto visibile sia una porzione significativa di sfondo trasparente.'))
                }
                if (input.requireTransparentEdges && (coverage.edgeTransparentPixelRatio < 0.5 || coverage.cornerTransparentPixelRatio < 0.75)) {
                    problems.push(problem('PNG_ALPHA_COVERAGE_INVALID', 'I bordi e gli angoli del PNG devono essere prevalentemente trasparenti.'))
                }
            } catch {
                problems.push(problem('PNG_ALPHA_COVERAGE_INVALID', 'Non e stato possibile verificare la copertura alpha del PNG.'))
            }
        }
        let detectedForeground: ForegroundBounds | null = null
        if (input.requireSubjectMargin) {
            try {
                const length = idatParts.reduce((total, part) => total + part.length, 0)
                const compressed = new Uint8Array(length)
                let cursor = 0
                for (const part of idatParts) { compressed.set(part, cursor); cursor += part.length }
                detectedForeground = await foregroundBounds({ compressedIdat: compressed, width: ihdr!.width, height: ihdr!.height, colorType: ihdr!.colorType, bitDepth: ihdr!.bitDepth, interlaceMethod: ihdr!.interlaceMethod })
                const requiredMargin = Math.ceil(Math.min(0.25, Math.max(0.01, typeof input.requireSubjectMargin === 'number' ? input.requireSubjectMargin : 0.06)) * Math.min(ihdr!.width, ihdr!.height))
                const smallestMargin = Math.min(detectedForeground.marginLeft, detectedForeground.marginTop, detectedForeground.marginRight, detectedForeground.marginBottom)
                if (smallestMargin < requiredMargin) {
                    problems.push(problem('FLUX_SUBJECT_CROPPED', `Il soggetto RAW FLUX entra nella safety margin: bbox ${detectedForeground.left},${detectedForeground.top}-${detectedForeground.right},${detectedForeground.bottom}; margine minimo ${smallestMargin}px, richiesto ${requiredMargin}px.`))
                }
            } catch (error) {
                const reason = error instanceof Error ? error.message : 'errore sconosciuto'
                problems.push(problem('PNG_FOREGROUND_DETECTION_FAILED', `Non e stato possibile verificare il framing del soggetto RAW FLUX: ${reason}`))
            }
        }
        if (problems.length) return { valid: false, problems }

        let sha256: string
        try {
            sha256 = await sha256Hex(input.bytes)
        } catch {
            return { valid: false, problems: [problem('SHA256_UNAVAILABLE', 'Non e stato possibile calcolare l hash SHA-256 del PNG.')] }
        }

        if (input.sourceSha256 && sha256 === input.sourceSha256 && !input.isMock) {
            return { valid: false, problems: [problem('RESULT_IMAGE_UNCHANGED', 'Il provider reale non puo restituire byte identici alla sorgente.')] }
        }

        return {
            valid: true,
            metadata: {
                mimeType: 'image/png',
                width: ihdr!.width,
                height: ihdr!.height,
                colorType: ihdr!.colorType,
                hasAlpha,
                ...(coverage ? { transparentPixelRatio: coverage.transparentPixelRatio, visiblePixelRatio: coverage.visiblePixelRatio } : {}),
                ...(detectedForeground ? { foregroundBounds: detectedForeground } : {}),
                sha256,
                bytes: input.bytes.length,
            },
            warnings: [
                ...(input.sourceSha256 && sha256 === input.sourceSha256 && input.isMock ? ['RESULT_IMAGE_UNCHANGED_MOCK' as const] : []),
            ],
        }
    }
}
