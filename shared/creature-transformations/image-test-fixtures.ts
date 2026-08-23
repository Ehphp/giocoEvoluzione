function uint32(value: number): number[] {
    return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
}

function chunk(type: string, data: number[]): number[] {
    return [...uint32(data.length), ...[...type].map((character) => character.charCodeAt(0)), ...data, 0, 0, 0, 0]
}

export function createTestPng(
    options: {
        width?: number
        height?: number
        colorType?: number
        bitDepth?: number
        includeIhdr?: boolean
        includeIdat?: boolean
        includeTransparency?: boolean
    } = {},
): Uint8Array {
    const width = options.width ?? 1024
    const height = options.height ?? 1536
    const colorType = options.colorType ?? 6
    const bitDepth = options.bitDepth ?? 8
    const bytes = [137, 80, 78, 71, 13, 10, 26, 10]
    if (options.includeIhdr !== false) {
        bytes.push(...chunk('IHDR', [...uint32(width), ...uint32(height), bitDepth, colorType, 0, 0, 0]))
    }
    if (options.includeTransparency) bytes.push(...chunk('tRNS', [255]))
    if (options.includeIdat !== false) bytes.push(...chunk('IDAT', [120, 1, 0, 0, 0, 255, 255, 0]))
    bytes.push(...chunk('IEND', []))
    return new Uint8Array(bytes)
}

/** Small, fully decodable opaque RGB PNG for foreground/framing validator tests. */
export async function createForegroundTestPng(
    options: {
        width?: number
        height?: number
        subject?: { left: number; top: number; right: number; bottom: number }
    } = {},
): Promise<Uint8Array> {
    const width = options.width ?? 40
    const height = options.height ?? 60
    const subject = options.subject ?? { left: 8, top: 10, right: width - 9, bottom: height - 11 }
    const raw = new Uint8Array(height * (width * 3 + 1))
    for (let y = 0; y < height; y += 1) {
        const row = y * (width * 3 + 1)
        raw[row] = 0
        for (let x = 0; x < width; x += 1) {
            const pixel = row + 1 + x * 3
            const isSubject = x >= subject.left && x <= subject.right && y >= subject.top && y <= subject.bottom
            raw[pixel] = isSubject ? 48 : 128
            raw[pixel + 1] = isSubject ? 112 : 128
            raw[pixel + 2] = isSubject ? 68 : 128
        }
    }
    const stream = new Response(raw).body
    if (!stream) throw new Error('Lo stream PNG di test non e disponibile.')
    const compressed = new Uint8Array(
        await new Response(stream.pipeThrough(new CompressionStream('deflate'))).arrayBuffer(),
    )
    return new Uint8Array([
        137,
        80,
        78,
        71,
        13,
        10,
        26,
        10,
        ...chunk('IHDR', [...uint32(width), ...uint32(height), 8, 2, 0, 0, 0]),
        ...chunk('IDAT', [...compressed]),
        ...chunk('IEND', []),
    ])
}
