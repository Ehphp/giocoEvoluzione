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
    | 'RESULT_IMAGE_UNCHANGED'
    | 'SHA256_UNAVAILABLE'

export type ImageValidationProfile = 'PROVIDER_RAW_RESULT' | 'FINAL_CREATURE_ASSET'
export type ImageValidationWarningCode = 'RESULT_IMAGE_UNCHANGED_MOCK' | 'RAW_RESULT_ALPHA_MISSING' | 'RAW_RESULT_ALPHA_COVERAGE_UNAVAILABLE'

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
    sha256: string
    bytes: number
}

export type ImageValidationResult =
    | { valid: true; metadata: ValidatedPngMetadata; warnings: ImageValidationWarningCode[] }
    | { valid: false; problems: ImageValidationProblem[] }

export type ImageValidationInput = Readonly<{
    bytes: Uint8Array
    mimeType: string
    renderSpecification: CreatureRenderSpecification
    sourceSha256?: string
    isMock?: boolean
    minBytes?: number
    maxBytes?: number
    profile?: ImageValidationProfile
    /** Used only for browser-post-processed candidates, never for raw provider output. */
    requireAlphaCoverage?: boolean
    /** Measure alpha coverage without making coverage a validity requirement. */
    measureAlphaCoverage?: boolean
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
    const decoded = new Uint8Array(await new Response(new Blob([compressedCopy.buffer]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())
    if (decoded.length !== input.height * (stride + 1)) throw new Error('La dimensione dei pixel PNG decompressi non e valida.')

    let offset = 0
    let previous = new Uint8Array(stride)
    let transparent = 0
    let visible = 0
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
        }
        previous = scanline
    }
    return { transparentPixelRatio: transparent / total, visiblePixelRatio: visible / total }
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
        const profile = input.profile ?? 'FINAL_CREATURE_ASSET'

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
        let ihdr: { width: number; height: number; bitDepth: number; colorType: number } | null = null
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
        if (ihdr && !hasAlpha && profile === 'FINAL_CREATURE_ASSET') problems.push(problem('PNG_ALPHA_REQUIRED', 'Il PNG deve dichiarare un canale alpha o un chunk tRNS.'))
        if (problems.length) return { valid: false, problems }

        let coverage: { transparentPixelRatio: number; visiblePixelRatio: number } | null = null
        let alphaCoverageUnavailable = false
        if (input.requireAlphaCoverage || input.measureAlphaCoverage) {
            try {
                const length = idatParts.reduce((total, part) => total + part.length, 0)
                const compressed = new Uint8Array(length)
                let cursor = 0
                for (const part of idatParts) { compressed.set(part, cursor); cursor += part.length }
                coverage = await alphaCoverage({ compressedIdat: compressed, width: ihdr!.width, height: ihdr!.height, colorType: ihdr!.colorType, bitDepth: ihdr!.bitDepth })
                if (input.requireAlphaCoverage && (coverage.transparentPixelRatio < 0.005 || coverage.visiblePixelRatio < 0.01 || coverage.visiblePixelRatio > 0.98)) {
                    problems.push(problem('PNG_ALPHA_COVERAGE_INVALID', 'Il PNG deve contenere sia un soggetto visibile sia una porzione significativa di sfondo trasparente.'))
                }
            } catch {
                if (input.requireAlphaCoverage) problems.push(problem('PNG_ALPHA_COVERAGE_INVALID', 'Non e stato possibile verificare la copertura alpha del PNG.'))
                else alphaCoverageUnavailable = true
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
                ...(coverage ?? {}),
                sha256,
                bytes: input.bytes.length,
            },
            warnings: [
                ...(input.sourceSha256 && sha256 === input.sourceSha256 && input.isMock ? ['RESULT_IMAGE_UNCHANGED_MOCK' as const] : []),
                ...(!hasAlpha && profile === 'PROVIDER_RAW_RESULT' ? ['RAW_RESULT_ALPHA_MISSING' as const] : []),
                ...(alphaCoverageUnavailable ? ['RAW_RESULT_ALPHA_COVERAGE_UNAVAILABLE' as const] : []),
            ],
        }
    }
}
