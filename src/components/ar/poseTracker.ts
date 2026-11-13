import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import modelAssetPath from '../../assets/pose_landmarker_lite.task?url'
import type { MPMask } from '@mediapipe/tasks-vision'
import type { PoseFrame, RateHealth } from '../../utils/arPose'

// Body tracking for the AR try-on: MediaPipe pose landmarks from the camera feed, on this device. Frames and landmarks are never sent anywhere
// or logged. The wasm, the model and the library are all served from our own origin (nothing comes from a CDN), and the library is imported
// only when the camera goes live, so it stays out of every other chunk.

declare global {
  interface Window {
    /** Dev only: stands in for MediaPipe in tests. Called with the frame time in ms; returns a pose or null for no body. */
    __silhoufitPoseFeed?: (ms: number) => PoseFrame | null
  }
}

export interface Detector {
  detect: (video: HTMLVideoElement, tMs: number) => PoseFrame | null
  close: () => void
  /** Turns the person mask on or off (off once the device is busy: reading it is the costliest part of a detection). The feed ignores it. */
  setMask: (on: boolean) => void
  /** What the model runs on; 'feed' is the dev test hook. */
  delegate: 'GPU' | 'CPU' | 'feed'
}

const LOAD_MS = 20_000
const TELEMETRY_HOST = 'odml.pa.googleapis.com'
let telemetryBlocked = false
// Set when the GPU delegate threw while detecting: the next detector starts on the CPU.
let gpuFailed = false

/**
 * MediaPipe's library logs usage to Google (POST to odml.pa.googleapis.com, every 60 s and when a landmarker closes) with window.fetch. This
 * answers that one host with an empty 200 and passes every other request through untouched. It stays installed: restoring it would let the
 * flush from a later close() through, and other code may have wrapped fetch since.
 */
function blockTelemetry() {
  if (telemetryBlocked) return
  telemetryBlocked = true
  const realFetch = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    return new URL(url, location.href).hostname === TELEMETRY_HOST ? Promise.resolve(new Response('', { status: 200 })) : realFetch(input, init)
  }
}

async function loadLandmarker(): Promise<Detector> {
  blockTelemetry()
  const { PoseLandmarker } = await import('@mediapipe/tasks-vision')
  const fileset = { wasmLoaderPath, wasmBinaryPath }
  const create = (delegate: 'GPU' | 'CPU') =>
    PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath, delegate }, runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: true })
  let delegate: 'GPU' | 'CPU' = gpuFailed ? 'CPU' : 'GPU'
  let landmarker: Awaited<ReturnType<typeof create>>
  try {
    landmarker = await create(delegate)
  } catch {
    delegate = 'CPU'
    landmarker = await create('CPU')
  }
  let masking = true
  // The one buffer the mask is copied into, reused by every detection (and so by the frame handed out); replaced only if the video size changes.
  let buffer = new Uint8Array(0)
  return {
    detect: (video, tMs) => {
      try {
        let frame = null as PoseFrame | null
        let copy: MPMask | undefined
        // The callback form makes no copies; the mask is only valid inside it. Read there, a GPU mask comes back all zeros (found with a
        // real model on a still photo, 800 x 1000: the same read after the call returns is right), so the callback only takes a GPU copy
        // of it and the bytes are read below, then the copy is freed. The sync form would copy too, and leaks a texture a frame unless closed.
        landmarker.detectForVideo(video, tMs, (result) => {
          const image = result.landmarks[0]
          if (!image) return
          frame = { image, world: result.worldLandmarks[0] ?? [] }
          if (masking) copy = result.segmentationMasks?.[0]?.clone()
        })
        if (copy) {
          try {
            // getAsUint8Array scales the 0..1 confidence to 0..255 (checked: max 255, with soft values at the edges). Row 0 is the top, and
            // the frame is raw, not mirrored, like the landmarks.
            const bytes = copy.getAsUint8Array()
            if (buffer.length !== bytes.length) buffer = new Uint8Array(bytes.length)
            buffer.set(bytes)
            // A person was found, so a mask with nothing in it is a failed read: leave it out rather than clip the whole shirt away.
            let any = false
            for (let i = 0; i < buffer.length && !any; i += 13) any = buffer[i] > 0
            if (any) frame!.mask = { data: buffer, width: copy.width, height: copy.height }
          } finally {
            copy.close()
          }
        }
        return frame
      } catch (error) {
        if (delegate === 'GPU') gpuFailed = true
        throw error
      }
    },
    close: () => landmarker.close(),
    setMask: (on) => {
      masking = on
      landmarker.setOptions({ outputSegmentationMasks: on }).catch(() => {})
    },
    delegate,
  }
}

/** Loads the pose model once: on the GPU if it can, else on the CPU. Rejects if that takes over 20 s; a load that finishes after that is closed. */
export function createDetector(): Promise<Detector> {
  const feed = import.meta.env.DEV ? window.__silhoufitPoseFeed : undefined
  if (feed) return Promise.resolve({ detect: (_video, tMs) => feed(tMs), close: () => {}, setMask: () => {}, delegate: 'feed' })

  return new Promise((resolve, reject) => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      reject(new Error('Loading body tracking timed out'))
    }, LOAD_MS)
    loadLandmarker().then(
      (detector) => {
        clearTimeout(timer)
        if (timedOut) detector.close()
        else resolve(detector)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Detects on each new video frame (at most the rate `health` allows) and hands the result to `onFrame`: one loop, no separate animation
 * frame. Returns a function that stops it. A detector that throws ends the loop and goes to `onError`.
 */
export function startPoseLoop(
  video: HTMLVideoElement,
  detector: Detector,
  health: RateHealth,
  onFrame: (frame: PoseFrame | null, tMs: number, detectMs: number) => void,
  onError: () => void,
) {
  let handle = 0
  let stopped = false
  let lastDetect = -Infinity
  let lastStamp = 0
  let masking = health.mask
  const useVideoFrames = 'requestVideoFrameCallback' in video

  const schedule = () => {
    handle = useVideoFrames ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick)
  }
  function tick(now: number) {
    if (stopped) return
    schedule()
    // A little under the interval, so a camera frame that lands early is not skipped for the next one.
    if (!video.videoWidth || now - lastDetect < health.intervalMs * 0.9) return
    lastDetect = now
    // MediaPipe needs strictly increasing timestamps.
    lastStamp = Math.max(now, lastStamp + 1)
    try {
      const start = performance.now()
      const frame = detector.detect(video, lastStamp)
      const detectMs = performance.now() - start
      health.record(lastStamp, detectMs)
      if (masking && !health.mask) {
        masking = false
        detector.setMask(false)
      }
      onFrame(frame, lastStamp, detectMs)
    } catch {
      stopped = true
      onError()
    }
  }
  schedule()

  return () => {
    stopped = true
    if (useVideoFrames) video.cancelVideoFrameCallback(handle)
    else cancelAnimationFrame(handle)
  }
}
