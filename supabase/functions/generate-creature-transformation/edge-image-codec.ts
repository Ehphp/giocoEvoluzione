import { Image } from 'npm:imagescript@1.3.1'

export async function convertJpegToPng(jpeg: Uint8Array): Promise<Uint8Array> {
    const image = await Image.decode(jpeg)
    return image.encode()
}