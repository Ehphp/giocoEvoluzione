export type CreatureRenderSpecification = {
    version: 'sprite-1024x1536-v1'
    width: 1024
    height: 1536
    outputMimeType: 'image/png'
    transparentBackground: true
    preservePose: true
    preserveComposition: true
    preserveCanvasMargins: true
}

export const CURRENT_CREATURE_RENDER_SPECIFICATION: Readonly<CreatureRenderSpecification> = Object.freeze({
    version: 'sprite-1024x1536-v1',
    width: 1024,
    height: 1536,
    outputMimeType: 'image/png',
    transparentBackground: true,
    preservePose: true,
    preserveComposition: true,
    preserveCanvasMargins: true,
})
