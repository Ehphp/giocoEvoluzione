function uint32(value: number): number[] {
    return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
}

function chunk(type: string, data: number[]): number[] {
    return [...uint32(data.length), ...[...type].map((character) => character.charCodeAt(0)), ...data, 0, 0, 0, 0]
}

export function createTestPng(options: {
    width?: number
    height?: number
    colorType?: number
    bitDepth?: number
    includeIhdr?: boolean
    includeIdat?: boolean
    includeTransparency?: boolean
} = {}): Uint8Array {
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
