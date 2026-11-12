import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraState = 'idle' | 'starting' | 'live' | 'paused' | 'denied' | 'no-camera' | 'in-use' | 'unsupported' | 'error'

const ERROR_STATE: Record<string, CameraState> = {
  NotAllowedError: 'denied',
  SecurityError: 'denied',
  NotFoundError: 'no-camera',
  OverconstrainedError: 'no-camera',
  NotReadableError: 'in-use',
  AbortError: 'in-use',
}

/**
 * The front camera for the AR preview. `start` must be called from a click: that tap is the consent. The stream goes to `videoRef` only;
 * no frame is drawn, copied or sent anywhere. Every track is stopped on unmount and when the tab is hidden (state `paused`, tap to resume).
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const alive = useRef(true)
  // Bumped by stop and by every start, so a stream that arrives after either is stopped at once.
  const request = useRef(0)
  const [state, setState] = useState<CameraState>('idle')

  const release = useCallback(() => {
    request.current += 1
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported')
      return
    }
    release()
    const mine = request.current
    setState('starting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      if (!alive.current || mine !== request.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      if (document.hidden) {
        // The tab was hidden while the permission prompt was open: do not go live behind the user's back.
        stream.getTracks().forEach((track) => track.stop())
        setState('paused')
        return
      }
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setState('live')
    } catch (error) {
      if (!alive.current || mine !== request.current) return
      setState(ERROR_STATE[(error as { name?: string } | null)?.name ?? ''] ?? 'error')
    }
  }, [release])

  /** The user turned it off: stop the tracks and return to the consent card. */
  const stop = useCallback(() => {
    release()
    setState('idle')
  }, [release])

  useEffect(() => {
    alive.current = true
    const onHidden = () => {
      if (!document.hidden || !streamRef.current) return
      release()
      setState('paused')
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      alive.current = false
      document.removeEventListener('visibilitychange', onHidden)
      release()
    }
  }, [release])

  return { state, videoRef, start, stop }
}
