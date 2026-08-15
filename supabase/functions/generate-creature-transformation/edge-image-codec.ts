import decodeJpeg, { init as initJpegDecoder } from 'npm:@jsquash/jpeg@1.6.0/decode.js'
import encodePng, { init as initPngEncoder } from 'npm:@jsquash/png@3.1.1/encode.js'

const JPEG_DECODER_WASM_URL = 'https://cdn.jsdelivr.net/npm/@jsquash/jpeg@1.6.0/codec/dec/mozjpeg_dec.wasm'
const PNG_ENCODER_WASM_URL = 'https://cdn.jsdelivr.net/npm/@jsquash/png@3.1.1/codec/pkg/squoosh_png_bg.wasm'

let codecInitialization: Promise<void> | null = null

async function compileWasm(url: string): Promise<WebAssembly.Module> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Codec WASM non disponibile (${response.status}).`)
    return WebAssembly.compile(await response.arrayBuffer())
}

function initializeCodecs(): Promise<void> {
    codecInitialization ??= Promise.all([
        compileWasm(JPEG_DECODER_WASM_URL),
        compileWasm(PNG_ENCODER_WASM_URL),
    ]).then(async ([jpegModule, pngModule]) => {
        await Promise.all([initJpegDecoder(jpegModule), initPngEncoder(pngModule)])
    })
    return codecInitialization
}

export async function convertJpegToPng(jpeg: Uint8Array): Promise<Uint8Array> {
    await initializeCodecs()
    const pixels = await decodeJpeg(jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.byteLength))
    return new Uint8Array(await encodePng(pixels))
}