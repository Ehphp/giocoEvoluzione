import decodeJpeg, { init as initJpegDecoder } from 'npm:@jsquash/jpeg@1.6.0/decode.js'
import decodePng, { init as initPngDecoder } from 'npm:@jsquash/png@3.1.1/decode.js'
import encodePng, { init as initPngEncoder } from 'npm:@jsquash/png@3.1.1/encode.js'
import { flipRgbaImageHorizontally } from '../../../shared/creature-transformations/horizontal-image-flip.ts'

const JPEG_DECODER_WASM_URL = 'https://cdn.jsdelivr.net/npm/@jsquash/jpeg@1.6.0/codec/dec/mozjpeg_dec.wasm'
const PNG_CODEC_WASM_URL = 'https://cdn.jsdelivr.net/npm/@jsquash/png@3.1.1/codec/pkg/squoosh_png_bg.wasm'

let jpegDecoderInitialization: Promise<void> | null = null
let pngCodecInitialization: Promise<void> | null = null

async function compileWasm(url: string): Promise<WebAssembly.Module> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Codec WASM non disponibile (${response.status}).`)
    return WebAssembly.compile(await response.arrayBuffer())
}

function initializeJpegDecoder(): Promise<void> {
    jpegDecoderInitialization ??= compileWasm(JPEG_DECODER_WASM_URL).then(initJpegDecoder)
    return jpegDecoderInitialization
}

function initializePngCodec(): Promise<void> {
    pngCodecInitialization ??= compileWasm(PNG_CODEC_WASM_URL).then(async (pngModule) => {
        await Promise.all([initPngDecoder(pngModule), initPngEncoder(pngModule)])
    })
    return pngCodecInitialization
}

export async function convertJpegToPng(jpeg: Uint8Array): Promise<Uint8Array> {
    await Promise.all([initializeJpegDecoder(), initializePngCodec()])
    // Queue finalization receives a full response buffer in the usual path. Reuse it instead of
    // allocating a second JPEG-sized ArrayBuffer; retain the safe slice only for sub-views.
    const source = jpeg.byteOffset === 0 && jpeg.byteLength === jpeg.buffer.byteLength
        ? jpeg.buffer as ArrayBuffer
        : jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength) as ArrayBuffer
    const pixels = await decodeJpeg(source)
    return new Uint8Array(await encodePng(pixels))
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes.buffer as ArrayBuffer
        : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

/**
 * Decodes the provider image, mirrors its RGBA pixels exactly once and writes a lossless PNG.
 * A JPEG must become PNG here to avoid a second lossy JPEG encode; PNG alpha is carried through
 * unchanged by the RGBA flip and PNG encoder.
 */
export async function flipImageHorizontallyToPng(input: { bytes: Uint8Array, mimeType: 'image/png' | 'image/jpeg' }): Promise<Readonly<{
    bytes: Uint8Array
    mimeType: 'image/png'
    width: number
    height: number
}>> {
    await Promise.all([initializePngCodec(), ...(input.mimeType === 'image/jpeg' ? [initializeJpegDecoder()] : [])])
    const decoded = input.mimeType === 'image/jpeg'
        ? await decodeJpeg(asArrayBuffer(input.bytes))
        : await decodePng(asArrayBuffer(input.bytes))
    // `ImageData.data` is typed as `ImageDataArray`, which now also covers the Float16 buffers of
    // an HDR canvas. The @jsquash PNG and JPEG decoders only ever produce 8-bit RGBA.
    const rgba = decoded.data as Uint8ClampedArray
    const mirrored = flipRgbaImageHorizontally({ data: rgba, width: decoded.width, height: decoded.height })
    return Object.freeze({
        bytes: new Uint8Array(await encodePng(mirrored as ImageData)),
        mimeType: 'image/png',
        width: mirrored.width,
        height: mirrored.height,
    })
}
