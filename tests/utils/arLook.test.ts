import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { keyLightX, LIGHT, lightGain, LightMeter, lumaStats, Sway, SWAY, trackedCamera, WEBCAM_HFOV_DEG } from '../../src/utils/arLook'

const tan = (deg: number) => Math.tan((deg * Math.PI) / 180)
const rgba = (width: number, height: number, at: (x: number, y: number) => number) =>
  Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => (i % 4 === 3 ? 255 : at(Math.floor(i / 4) % width, Math.floor(i / 4 / width))))

describe('lightGain', () => {
  it('is 1 at the reference brightness and is clamped for a dark or a bright room', () => {
    expect(lightGain(LIGHT.refLum)).toBeCloseTo(1)
    expect(lightGain(0)).toBe(LIGHT.minGain)
    expect(lightGain(1)).toBe(LIGHT.maxGain)
    expect(lightGain(0.2)).toBeLessThan(1)
    expect(lightGain(0.7)).toBeGreaterThan(1)
    expect(lightGain(-1)).toBe(LIGHT.minGain)
  })

  it('moves the key light toward the brighter side, by a small clamped amount', () => {
    expect(keyLightX(0)).toBe(LIGHT.keyX)
    expect(keyLightX(0.2)).toBeGreaterThan(keyLightX(0))
    expect(keyLightX(-0.2)).toBeLessThan(keyLightX(0))
    expect(keyLightX(5)).toBe(LIGHT.keyX + LIGHT.keyShift)
    expect(keyLightX(-5)).toBe(LIGHT.keyX - LIGHT.keyShift)
  })
})

describe('lumaStats', () => {
  it('reads the mean luminance and, mirrored, which side of the screen is brighter', () => {
    expect(lumaStats(rgba(16, 12, () => 255), 16, 12).lum).toBeCloseTo(1)
    expect(lumaStats(rgba(16, 12, () => 255), 16, 12).balance).toBeCloseTo(0)
    expect(lumaStats(rgba(16, 12, () => 0), 16, 12)).toEqual({ lum: 0, balance: 0 })
    // The video's left half is bright: that is the right of the screen once mirrored.
    const videoLeft = lumaStats(rgba(16, 12, (x) => (x < 8 ? 200 : 100)), 16, 12)
    expect(videoLeft.balance).toBeCloseTo((200 - 100) / (200 + 100))
    expect(videoLeft.lum).toBeCloseTo(150 / 255)
    expect(lumaStats(rgba(16, 12, (x) => (x < 8 ? 100 : 200)), 16, 12).balance).toBeLessThan(0)
  })
})

describe('LightMeter', () => {
  it('takes the first sample as is, then eases toward the next ones', () => {
    const m = new LightMeter()
    m.push(0.8, 0.2)
    expect(m.lum).toBe(0.8)
    m.push(0.4, 0)
    expect(m.lum).toBeCloseTo(0.8 + LIGHT.ema * (0.4 - 0.8))
    m.reset()
    expect([m.lum, m.balance]).toEqual([LIGHT.refLum, 0])
  })
})

describe('Sway', () => {
  const run = (frames: number, anchor: (i: number) => { x: number; y: number; roll: number }, widthPx = 400) => {
    const s = new Sway()
    const out: number[] = []
    for (let i = 0; i < frames; i++) {
      s.update(anchor(i), i * 33, 300, widthPx)
      out.push(s.magnitude)
    }
    return { s, out }
  }

  it('lags the body when it moves, against the direction of travel', () => {
    const { s } = run(10, (i) => ({ x: i * 6, y: 0, roll: 0 }))
    expect(s.x).toBeLessThan(0)
    expect(Math.abs(s.y)).toBeLessThan(1e-6)
  })

  it('stays within the share of the garment width however fast it moves, and scales with the amplitude up to it', () => {
    const { out } = run(40, (i) => ({ x: i * 200, y: 0, roll: 0 }))
    expect(Math.max(...out)).toBeLessThanOrEqual(SWAY.max * 400 + 1e-6)
    const slow = run(40, (i) => ({ x: i * 5, y: 0, roll: 0 })).out
    expect(Math.max(...slow)).toBeGreaterThan(0)
    expect(Math.max(...slow)).toBeLessThan(Math.max(...out))
  })

  it('settles back to rest once the person stops, without overshooting', () => {
    const s = new Sway()
    let sign = 0
    for (let i = 0; i < 60; i++) {
      const moving = i < 15
      s.update({ x: moving ? i * 8 : 15 * 8, y: 0, roll: 0 }, i * 33, 300, 400)
      if (!moving) sign = Math.max(sign, s.x)
    }
    expect(Math.abs(s.x)).toBeLessThan(0.05)
    expect(sign).toBeLessThanOrEqual(0)
  })

  it('treats jitter under the dead zone as still, and follows a roll at the hem', () => {
    expect(run(30, (i) => ({ x: i % 2 ? 0.3 : 0, y: 0, roll: 0 })).out.every((m) => m === 0)).toBe(true)
    const { s } = run(10, (i) => ({ x: 0, y: 0, roll: i * 0.02 }))
    expect(s.x).toBeLessThan(0)
  })

  it('resets after a gap in tracking, and on reset', () => {
    const s = new Sway()
    s.update({ x: 0, y: 0, roll: 0 }, 0, 300, 400)
    s.update({ x: 20, y: 0, roll: 0 }, 33, 300, 400)
    expect(s.magnitude).toBeGreaterThan(0)
    s.update({ x: 500, y: 0, roll: 0 }, 2000, 300, 400)
    expect(s.magnitude).toBe(0)
    s.update({ x: 500, y: 0, roll: 0 }, 2033, 300, 400)
    s.reset()
    expect(s.magnitude).toBe(0)
  })
})

describe('trackedCamera', () => {
  const views = {
    // A 4:3 camera in a wide stage: cover crops the top and bottom, so the visible vertical field is narrower than the video's.
    landscape: { videoW: 640, videoH: 480, width: 1280, height: 720 },
    // The same camera in a tall stage: the height fits exactly, the sides are cropped, so the vertical field is the video's own.
    portrait: { videoW: 640, videoH: 480, width: 360, height: 720 },
  }

  it('derives the vertical field of view from the horizontal one, the video aspect and the cover crop', () => {
    const landscape = trackedCamera(views.landscape)
    const portrait = trackedCamera(views.portrait)
    expect(portrait.fovDeg).toBeCloseTo((2 * Math.atan(tan(WEBCAM_HFOV_DEG / 2) * (480 / 640)) * 180) / Math.PI, 6)
    expect(landscape.fovDeg).toBeCloseTo((2 * Math.atan(tan(WEBCAM_HFOV_DEG / 2) * (720 / 1280)) * 180) / Math.PI, 6)
    expect(landscape.fovDeg).toBeLessThan(portrait.fovDeg)
    // A video of another aspect (16:9 at the same width) has a smaller vertical field for the same stage height ratio.
    expect(trackedCamera({ ...views.portrait, videoH: 360 }).fovDeg).toBeLessThan(portrait.fovDeg)
  })

  it.each(Object.entries(views))('projects a point on the z = 0 plane to its stage pixel (%s)', (_name, view) => {
    const { fovDeg, distance, aspect } = trackedCamera(view)
    const camera = new THREE.PerspectiveCamera(fovDeg, aspect, 1, 10 * distance)
    camera.position.set(view.width / 2, -view.height / 2, distance)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
    for (const [px, py] of [[0, 0], [view.width, view.height], [view.width / 3, view.height * 0.8], [view.width / 2, view.height / 2]]) {
      const ndc = new THREE.Vector3(px, -py, 0).project(camera)
      expect((ndc.x + 1) * 0.5 * view.width).toBeCloseTo(px, 3)
      expect((1 - ndc.y) * 0.5 * view.height).toBeCloseTo(py, 3)
    }
  })
})
