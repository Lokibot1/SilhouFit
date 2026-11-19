import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { SLEEVE_MAX, SLEEVE_MIN } from '../../src/utils/arArms'
import { contactShade, darkLift, DARK, foldShade, grainStrength, GRAIN, keyLightX, LIGHT, lightGain, LightMeter, lumaStats, roomTint, SHADE, sheenStrength, sheenTint, SLEEVE_SWAY_MAX, SleeveSway, Sway, WEAVE, weaveTexels, SWAY, trackedCamera, WEBCAM_HFOV_DEG } from '../../src/utils/arLook'

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
    expect(lumaStats(rgba(16, 12, () => 0), 16, 12)).toEqual({ lum: 0, balance: 0, r: 0, g: 0, b: 0 })
    // The video's left half is bright: that is the right of the screen once mirrored.
    const videoLeft = lumaStats(rgba(16, 12, (x) => (x < 8 ? 200 : 100)), 16, 12)
    expect(videoLeft.balance).toBeCloseTo((200 - 100) / (200 + 100))
    expect(videoLeft.lum).toBeCloseTo(150 / 255)
    expect(lumaStats(rgba(16, 12, (x) => (x < 8 ? 100 : 200)), 16, 12).balance).toBeLessThan(0)
  })
})

describe('room tint', () => {
  const tinted = (r: number, g: number, b: number) => Uint8ClampedArray.from({ length: 16 * 12 * 4 }, (_, i) => [r, g, b, 255][i % 4])

  it('is neutral for a grey frame and leans to red for a red-tinted one', () => {
    expect(roomTint(lumaStats(tinted(120, 120, 120), 16, 12))).toEqual([1, 1, 1])
    const [r, g, b] = roomTint(lumaStats(tinted(200, 120, 100), 16, 12))
    expect(r).toBe(1)
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
  })

  it('tints the sheen half way, from the shirt colour blended a quarter toward white', () => {
    const grey = { r: 0.5, g: 0.5, b: 0.5 }
    expect(sheenTint('#000000', grey)).toEqual([0.25, 0.25, 0.25])
    expect(sheenTint('#000', grey)).toEqual([0.25, 0.25, 0.25])
    const [r, g, b] = sheenTint('#808080', { r: 0.9, g: 0.5, b: 0.4 })
    expect(r).toBeGreaterThan(g)
    expect(g).toBeGreaterThan(b)
    expect(sheenTint('#ffffff', { r: 0, g: 0, b: 0 })).toEqual([1, 1, 1])
  })

  it('is smoothed by the meter like the brightness and neutral after a reset', () => {
    const m = new LightMeter()
    expect([m.r, m.g, m.b]).toEqual([1, 1, 1])
    m.push(0.5, 0, { r: 0.8, g: 0.4, b: 0.2 })
    expect(m.r).toBe(0.8)
    m.push(0.5, 0, { r: 0.4, g: 0.4, b: 0.2 })
    expect(m.r).toBeCloseTo(0.8 + LIGHT.ema * (0.4 - 0.8))
    m.reset()
    expect([m.r, m.g, m.b]).toEqual([1, 1, 1])
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

describe('contactShade', () => {
  it('opens the underarm of a raised arm and closes it on one that hangs, by side', () => {
    const { underarm } = contactShade([SLEEVE_MIN, SLEEVE_MAX], 0)
    expect(underarm[0]).toBeGreaterThan(underarm[1])
    expect(underarm[0]).toBeCloseTo(SHADE.underarm * 1.5)
    expect(underarm[1]).toBeCloseTo(SHADE.underarm * 0.5)
    expect(contactShade([SLEEVE_MAX, SLEEVE_MIN], 0).underarm).toEqual([underarm[1], underarm[0]])
  })

  it('is symmetric facing the camera and mirrored for a turn either way, and the turn darkens the collar and hem', () => {
    const level = contactShade([SLEEVE_MIN, SLEEVE_MIN], 0)
    expect(level.underarm[0]).toBe(level.underarm[1])
    expect(level.collar).toBe(SHADE.collar)
    expect(level.hem).toBe(SHADE.hem)
    const [left, right] = [contactShade([SLEEVE_MIN, SLEEVE_MAX], 1), contactShade([SLEEVE_MIN, SLEEVE_MAX], -1)]
    expect(left).toEqual(right)
    expect(left.collar).toBeGreaterThan(level.collar)
    expect(left.hem).toBeGreaterThan(level.hem)
    expect(contactShade([SLEEVE_MIN, SLEEVE_MIN], Math.PI / 2).hem).toBeCloseTo(SHADE.hem * 1.5)
  })

  it('stays within half of the rest strengths for any arm or yaw', () => {
    for (const theta of [-5, 0, SLEEVE_MIN, SLEEVE_MAX, 9]) {
      const c = contactShade([theta, theta], 2.2)
      for (const [value, rest] of [[c.underarm[0], SHADE.underarm], [c.collar, SHADE.collar], [c.hem, SHADE.hem]]) {
        expect(value).toBeLessThanOrEqual(rest * 1.5 + 1e-9)
        expect(value).toBeGreaterThanOrEqual(rest * 0.5 - 1e-9)
      }
    }
  })
})

describe('weaveTexels', () => {
  const { size, threads } = WEAVE
  const period = size / threads
  const at = (t: Uint8Array, x: number, y: number, c: number) => t[(((y + size) % size) * size + ((x + size) % size)) * 4 + c]

  it.each(['normal', 'roughness'] as const)('tiles with no seam (%s)', (kind) => {
    const t = weaveTexels(kind)
    expect(t.length).toBe(size * size * 4)
    for (let c = 0; c < 4; c++)
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) expect(Math.abs(at(t, x + period, y, c) - at(t, x, y, c))).toBeLessThanOrEqual(1)
    // The step across the tile edge is no bigger than the biggest step inside the tile.
    let [inside, edge] = [0, 0]
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        for (const c of [0, 1])
          for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
            const step = Math.abs(at(t, nx, ny, c) - at(t, x, y, c))
            if (nx < size && ny < size) inside = Math.max(inside, step)
            else edge = Math.max(edge, step)
          }
    expect(edge).toBeLessThanOrEqual(inside)
  })

  it('is a mostly upright normal map that tilts both ways, and a roughness map that stays rough', () => {
    const n = weaveTexels('normal')
    const r = weaveTexels('roughness')
    const red = Array.from({ length: size * size }, (_, i) => n[i * 4])
    expect(Math.min(...red)).toBeLessThan(120)
    expect(Math.max(...red)).toBeGreaterThan(135)
    for (let i = 0; i < size * size; i++) {
      expect(n[i * 4 + 2]).toBeGreaterThan(200)
      expect(r[i * 4 + 1]).toBeGreaterThanOrEqual(Math.floor((1 - WEAVE.roughnessDip) * 255))
    }
  })
})

describe('matching the camera and showing form on dark cloth', () => {
  it('boosts the sheen and the lift on dark colours and leaves white at the base', () => {
    expect(sheenStrength('#ffffff', 0.35)).toBeCloseTo(0.35)
    expect(sheenStrength('#000000', 0.35)).toBeCloseTo(0.35 * (1 + DARK.sheen))
    expect(sheenStrength('#000', 0.35)).toBeCloseTo(sheenStrength('#000000', 0.35))
    expect(sheenStrength('#808080', 0.35)).toBeGreaterThan(0.35)
    expect(sheenStrength('#808080', 0.35)).toBeLessThan(sheenStrength('#101010', 0.35))
    expect(darkLift('#ffffff')).toBeCloseTo(0)
    expect(darkLift('#000000')).toBeCloseTo(DARK.lift)
  })

  it('grains a dark video more than a bright one, within its range', () => {
    expect(grainStrength(0)).toBeCloseTo(GRAIN.max)
    expect(grainStrength(1)).toBeCloseTo(GRAIN.min)
    expect(grainStrength(0.2)).toBeGreaterThan(grainStrength(0.7))
    expect(grainStrength(-3)).toBeCloseTo(GRAIN.max)
    expect(grainStrength(9)).toBeCloseTo(GRAIN.min)
  })

  it('folds from a raised arm on its own side, with the turn and the lean, and always a little drape', () => {
    const down = foldShade([SLEEVE_MIN, SLEEVE_MIN], 0, 0)
    expect(down.arm).toEqual([0, 0])
    expect(down.chest).toBe(0)
    expect(down.drape).toBeGreaterThan(0)
    const raised = foldShade([SLEEVE_MAX, SLEEVE_MIN], 0, 0)
    expect(raised.arm[0]).toBeGreaterThan(raised.arm[1])
    expect(foldShade([SLEEVE_MIN, SLEEVE_MIN], 0.8, 0).chest).toBeGreaterThan(0)
    expect(foldShade([SLEEVE_MIN, SLEEVE_MIN], 0.8, 0)).toEqual(foldShade([SLEEVE_MIN, SLEEVE_MIN], -0.8, 0))
    expect(foldShade([SLEEVE_MIN, SLEEVE_MIN], 0, 0.3).chest).toBeGreaterThan(0)
    expect(foldShade([9, 9], 9, 9).arm.every((a) => a <= 1)).toBe(true)
    expect(foldShade([9, 9], 1.5, 1.5).chest).toBeLessThanOrEqual(1)
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

describe('Sway with turns and hips', () => {
  const frames = (anchor: (i: number) => { x: number; y: number; roll: number; yaw?: number; hipX?: number | null }, n = 12) => {
    const s = new Sway()
    for (let i = 0; i < n; i++) s.update(anchor(i), i * 33, 300, 400)
    return s
  }

  it('lags the hem behind a turn, gives zero for a held yaw, and stays under the width limit', () => {
    const turning = frames((i) => ({ x: 0, y: 0, roll: 0, yaw: i * 0.05 }))
    expect(turning.x).toBeLessThan(0)
    expect(Math.abs(turning.y)).toBeLessThan(1e-6)
    expect(frames(() => ({ x: 0, y: 0, roll: 0, yaw: 1 })).magnitude).toBe(0)
    expect(frames((i) => ({ x: 0, y: 0, roll: 0, yaw: i * 3 }), 40).magnitude).toBeLessThanOrEqual(SWAY.max * 400 + 1e-6)
  })

  it('follows the mean of the shoulders and the hips, and ignores hips that are not seen', () => {
    const base = frames((i) => ({ x: i * 6, y: 0, roll: 0 }))
    const hipsWithShoulders = frames((i) => ({ x: i * 6, y: 0, roll: 0, hipX: i * 6 }))
    expect(hipsWithShoulders.x).toBeCloseTo(base.x)
    expect(frames((i) => ({ x: i * 6, y: 0, roll: 0, hipX: null })).x).toBe(base.x)
    const swinging = frames((i) => ({ x: 0, y: 0, roll: 0, hipX: i * 12 }))
    expect(swinging.x).toBeLessThan(0)
    expect(frames((i) => ({ x: 0, y: 0, roll: 0, hipX: i % 2 ? null : i * 12 })).magnitude).toBe(0)
  })

  it('gives the same output for the same input', () => {
    const run = () => frames((i) => ({ x: i * 7, y: i * 3, roll: i * 0.01, yaw: i * 0.04, hipX: i * 5 }), 20)
    expect([run().x, run().y]).toEqual([run().x, run().y])
  })
})

describe('SleeveSway', () => {
  const run = (side: -1 | 1, frames: number, at: (i: number) => { y: number; yaw: number }) => {
    const s = new SleeveSway(side)
    const out: number[] = []
    for (let i = 0; i < frames; i++) {
      s.update(at(i).y, at(i).yaw, i * 33, 400)
      out.push(s.angle)
    }
    return { s, out }
  }

  it('lifts the cuffs out when the body drops, on both sides, by a few degrees at most', () => {
    const [left, right] = [-1, 1].map((side) => run(side as -1 | 1, 40, (i) => ({ y: -i * 40, yaw: 0 })))
    expect(Math.max(...right.out)).toBeGreaterThan(0)
    expect(Math.max(...right.out)).toBeLessThanOrEqual(SLEEVE_SWAY_MAX + 1e-9)
    expect(Math.max(...left.out)).toBe(0)
    expect(Math.min(...left.out)).toBeLessThan(0)
    expect(Math.min(...left.out)).toBeGreaterThanOrEqual(-SLEEVE_SWAY_MAX - 1e-9)
  })

  it('swings against a turn, and not at all for a held yaw', () => {
    expect(run(1, 10, (i) => ({ y: 0, yaw: i * 0.05 })).s.angle).toBeLessThan(0)
    expect(run(-1, 10, (i) => ({ y: 0, yaw: i * 0.05 })).s.angle).toBeLessThan(0)
    expect(run(1, 20, () => ({ y: 0, yaw: 1 })).s.angle).toBe(0)
  })

  it('settles to exactly zero once the body stops, without overshooting', () => {
    const { out, s } = run(1, 80, (i) => ({ y: i < 10 ? -i * 30 : -270, yaw: 0 }))
    expect(Math.min(...out.slice(10))).toBeGreaterThanOrEqual(0)
    expect(s.angle).toBe(0)
  })

  it('resets after a gap, and gives the same output for the same input', () => {
    const s = new SleeveSway(1)
    s.update(0, 0, 0, 400)
    s.update(-40, 0, 33, 400)
    expect(s.angle).not.toBe(0)
    s.update(-500, 0, 2000, 400)
    expect(s.angle).toBe(0)
    const at = (i: number) => ({ y: -i * 25, yaw: i * 0.03 })
    expect(run(1, 15, at).out).toEqual(run(1, 15, at).out)
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
