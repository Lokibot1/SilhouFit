import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import modelAssetPath from '../../assets/pose_landmarker_lite.task?url'
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
    PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath, delegate }, runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false })
  let delegate: 'GPU' | 'CPU' = gpuFailed ? 'CPU' : 'GPU'
  let landmarker: Awaited<ReturnType<typeof create>>
  try {
    landmarker = await create(delegate)
  } catch {
    delegate = 'CPU'
    landmarker = await create('CPU')
  }
  return {
    detect: (video, tMs) => {
      try {
        const result = landmarker.detectForVideo(video, tMs)
        const image = result.landmarks[0]
        return image ? { image, world: result.worldLandmarks[0] ?? [] } : null
      } catch (error) {
        if (delegate === 'GPU') gpuFailed = true
        throw error
      }
    },
    close: () => landmarker.close(),
    delegate,
  }
}

/** Loads the pose model once: on the GPU if it can, else on the CPU. Rejects if that takes over 20 s; a load that finishes after that is closed. */
export function createDetector(): Promise<Detector> {
  const feed = import.meta.env.DEV ? window.__silhoufitPoseFeed : undefined
  if (feed) return Promise.resolve({ detect: (_video, tMs) => feed(tMs), close: () => {}, delegate: 'feed' })

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
