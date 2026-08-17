/** A decoded 8-bit RGBA raster. Kept structural so it works in both browser and Edge runtimes. */
export type RgbaImage = Readonly<{
    data: Uint8ClampedArray
    width: number
    height: number
}>

/**
 * Mirrors pixels without resampling. The output preserves the input canvas, every RGBA value
 * (including alpha), and therefore cannot crop or soften the subject.
 */
export function flipRgbaImageHorizontally(input: RgbaImage): RgbaImage {
    if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1 || input.data.length !== input.width * input.height * 4) {
        throw new Error('Il raster RGBA da specchiare non ha dimensioni valide.')
    }
    const mirrored = new Uint8ClampedArray(input.data.length)
    const rowBytes = input.width * 4
    for (let y = 0; y < input.height; y += 1) {
        const row = y * rowBytes
        for (let x = 0; x < input.width; x += 1) {
            const source = row + x * 4
            const destination = row + (input.width - x - 1) * 4
            mirrored[destination] = input.data[source]
            mirrored[destination + 1] = input.data[source + 1]
            mirrored[destination + 2] = input.data[source + 2]
            mirrored[destination + 3] = input.data[source + 3]
        }
    }
    return Object.freeze({ data: mirrored, width: input.width, height: input.height })
}
