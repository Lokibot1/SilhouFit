import { lumaStats } from '../../utils/arLook'

// The AR try-on's room-brightness reading. The one place a camera frame is drawn anywhere but the <video>: it is scaled down to 16 x 12 pixels
// (at most 192 pixels) on one shared canvas, reduced to a mean luminance and a left-right balance (two numbers) and forgotten. Nothing of it is
// stored, logged, shown in the DOM or sent anywhere, and it only runs while the shirt follows a person on a visible tab.

const WIDTH = 16
const HEIGHT = 12
let context: CanvasRenderingContext2D | undefined

/** Mean luminance (0..1) and balance (-1..1, positive = the right of the screen brighter) of the live video now, or null if there is no frame to read. */
export function sampleLight(video: HTMLVideoElement) {
  if (document.hidden || video.readyState < 2 || !video.videoWidth) return null
  if (!context) {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    context = canvas.getContext('2d', { willReadFrequently: true }) ?? undefined
  }
  if (!context) return null
  context.drawImage(video, 0, 0, WIDTH, HEIGHT)
  return lumaStats(context.getImageData(0, 0, WIDTH, HEIGHT).data, WIDTH, HEIGHT)
}
