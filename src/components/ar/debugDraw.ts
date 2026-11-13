import { LEFT_ELBOW, LEFT_HIP, LEFT_SHOULDER, LEFT_WRIST, RIGHT_ELBOW, RIGHT_HIP, RIGHT_SHOULDER, RIGHT_WRIST, coverMap, toStage, type MaskFrame, type Point, type Pose, type PoseFrame, type View } from '../../utils/arPose'
import type { ForearmCall } from '../../utils/arOcclude'

// The ?debug=ar "Draw tracking" overlay: the tracker's view of the person, painted on a 2D canvas above the stage. Everything stays on the device.

const SHOWN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, LEFT_SHOULDER, RIGHT_SHOULDER, LEFT_ELBOW, RIGHT_ELBOW, LEFT_WRIST, RIGHT_WRIST, LEFT_HIP, RIGHT_HIP]
const BONES = [
  [LEFT_SHOULDER, LEFT_ELBOW],
  [LEFT_ELBOW, LEFT_WRIST],
  [RIGHT_SHOULDER, RIGHT_ELBOW],
  [RIGHT_ELBOW, RIGHT_WRIST],
  [LEFT_SHOULDER, RIGHT_SHOULDER],
  [LEFT_SHOULDER, LEFT_HIP],
  [RIGHT_SHOULDER, RIGHT_HIP],
  [LEFT_HIP, RIGHT_HIP],
]
const SEEN = '#16a34a'
const UNSEEN = '#dc2626'
const MASK_WIDTH = 160
const MASK_THRESHOLD = 102

export interface TrackingScene {
  frame: PoseFrame
  pose: Pose
  view: View
  /** Half the drawn shoulder seam width in stage px. */
  seamHalf: number
  /** Where the shirt's hem is (stage px, y down) and half its drawn width there. */
  hem: { x: number; y: number; half: number }
}

/** Paints into `canvas` (stage size in CSS px, backing store scaled by dpr). The mask goes through a small offscreen canvas first, so its cost is a few thousand pixels. */
export function createTrackingPainter(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const small = document.createElement('canvas')
  const smallCtx = small.getContext('2d')!
  let tint: ImageData | undefined

  function drawMask(mask: MaskFrame, view: View) {
    const step = Math.max(1, Math.ceil(mask.width / MASK_WIDTH))
    const [w, h] = [Math.floor(mask.width / step), Math.floor(mask.height / step)]
    if (!tint || tint.width !== w || tint.height !== h) {
      small.width = w
      small.height = h
      tint = smallCtx.createImageData(w, h)
    }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        tint.data[o] = 255
        tint.data[o + 1] = 0
        tint.data[o + 2] = 200
        tint.data[o + 3] = mask.data[y * step * mask.width + x * step] >= MASK_THRESHOLD ? 70 : 0
      }
    smallCtx.putImageData(tint, 0, 0)
    // The mask is the raw video frame: mirror it and place it the way the video is shown (object-fit: cover).
    const { scale, offsetX, offsetY } = coverMap(view)
    ctx.save()
    ctx.translate(offsetX + view.videoW * scale, offsetY)
    ctx.scale(-1, 1)
    ctx.drawImage(small, 0, 0, view.videoW * scale, view.videoH * scale)
    ctx.restore()
  }

  function capsulePath({ a, b, radius: r }: ForearmCall['capsule']) {
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    ctx.beginPath()
    ctx.arc(a.x, a.y, r, angle + Math.PI / 2, angle + (3 * Math.PI) / 2)
    ctx.arc(b.x, b.y, r, angle - Math.PI / 2, angle + Math.PI / 2)
    ctx.closePath()
  }

  const label = (text: string, p: Point, color: string, width: number) => {
    ctx.fillStyle = color
    ctx.fillText(text, Math.max(4, Math.min(p.x + 6, width - ctx.measureText(text).width - 4)), Math.max(14, p.y - 6))
  }

  return {
    clear: () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    },
    draw({ frame, pose, view, seamHalf, hem }: TrackingScene) {
      const dpr = canvas.width / view.width
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, view.width, view.height)
      if (frame.mask) drawMask(frame.mask, view)
      ctx.font = '12px monospace'
      ctx.lineWidth = 2
      const at = (i: number) => toStage(frame.image[i], view)
      const seen = (i: number) => (frame.image[i]?.visibility ?? 1) >= 0.5

      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      for (const [i, j] of BONES) {
        if (!frame.image[i] || !frame.image[j]) continue
        ctx.beginPath()
        ctx.moveTo(at(i).x, at(i).y)
        ctx.lineTo(at(j).x, at(j).y)
        ctx.stroke()
      }

      // Occluders: forearm capsules (dashed when not cut, with the world z gap to the shoulder midpoint in m) and the face ellipse.
      for (const call of pose.occluders.forearms) {
        if (!call) continue
        const colour = call.cut ? '#22d3ee' : '#f59e0b'
        ctx.strokeStyle = colour
        ctx.setLineDash(call.cut ? [] : [6, 4])
        capsulePath(call.capsule)
        ctx.stroke()
        ctx.setLineDash([])
        const gap = call.gapM === undefined ? 'no z' : `z ${call.gapM >= 0 ? '+' : ''}${call.gapM.toFixed(2)} m`
        label(`${call.cut ? 'cut' : (call.why ?? 'kept')} ${gap}`, call.capsule.b, colour, view.width)
      }
      const face = pose.occluders.face
      if (face) {
        ctx.strokeStyle = '#22d3ee'
        ctx.beginPath()
        ctx.ellipse(face.x, face.y, face.rx, face.ry, face.tilt, 0, 2 * Math.PI)
        ctx.stroke()
      }

      // The seam points the shirt is pinned to: the midpoint and the two ends of the shoulder line.
      ctx.fillStyle = '#facc15'
      const [dx, dy] = [Math.cos(pose.roll) * seamHalf, -Math.sin(pose.roll) * seamHalf]
      for (const [x, y] of [[pose.x, pose.y], [pose.x - dx, pose.y - dy], [pose.x + dx, pose.y + dy]]) ctx.fillRect(x - 4, y - 4, 8, 8)

      // The hem line, along the rolled shoulder axis: it should land below the hip dots (the torso box is the white shoulder and hip lines above).
      ctx.strokeStyle = '#e879f9'
      ctx.beginPath()
      ctx.moveTo(hem.x - Math.cos(pose.roll) * hem.half, hem.y + Math.sin(pose.roll) * hem.half)
      ctx.lineTo(hem.x + Math.cos(pose.roll) * hem.half, hem.y - Math.sin(pose.roll) * hem.half)
      ctx.stroke()
      label('hem', { x: hem.x + hem.half, y: hem.y }, '#e879f9', view.width)

      for (const i of SHOWN) {
        if (!frame.image[i]) continue
        const p = at(i)
        ctx.fillStyle = seen(i) ? SEEN : UNSEEN
        ctx.beginPath()
        ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI)
        ctx.fill()
        label(String(i), p, ctx.fillStyle, view.width)
      }
    },
  }
}
