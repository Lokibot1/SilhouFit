import {
  motion,
  useMotionTemplate,
  useTransform,
  type MotionValue,
} from 'motion/react'

/**
 * The page's authored moment: scroll position runs the fitting pipeline the
 * product is built on. The figure is acquired the way the real module acquires
 * one -- a camera frame finds it and pulls focus, pose landmarks lock onto the
 * joints, then a garment renders over the body.
 *
 * Geometry is shared with SilhouetteMark on purpose: this is the same figure
 * from the hero card, seen one stage deeper in.
 */

const FIGURE =
  'M100 18c14 0 24 11 24 25 0 10-5 18-12 23 16 7 26 21 29 40l7 62c1 8-5 15-13 15H65c-8 0-14-7-13-15l7-62c3-19 13-33 29-40-7-5-12-13-12-23 0-14 10-25 24-25Z'

// A garment cut to sit inside the silhouette's own contour, so it renders onto
// the body rather than floating over a rectangle of it.
const GARMENT =
  'M76 86c10-6 38-6 48 0l8 62c-12 6-52 6-64 0Z'

const JOINTS = [
  { x: 100, y: 41 },
  { x: 100, y: 68 },
  { x: 76, y: 88 },
  { x: 124, y: 88 },
  { x: 64, y: 122 },
  { x: 136, y: 122 },
  { x: 100, y: 158 },
  { x: 82, y: 168 },
  { x: 118, y: 168 },
]

const BONES: [number, number][] = [
  [1, 6],
  [1, 2],
  [1, 3],
  [2, 4],
  [3, 5],
  [6, 7],
  [6, 8],
]

// Where each stage owns the scroll. The overlaps are deliberate: one stage is
// still settling as the next begins, which is what makes it read as a single
// continuous acquisition instead of three slides.
const CAMERA = [0, 0.3]
const POSE = [0.28, 0.64]
const GARMENT_RANGE = [0.62, 0.95]

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t
}

function Joint({
  joint,
  index,
  count,
  progress,
}: {
  joint: { x: number; y: number }
  index: number
  count: number
  progress: MotionValue<number>
}) {
  // Landmarks lock on in sequence, head downward, each inside its own slice of
  // the pose stage. A simultaneous pop would read as a decoration appearing.
  const start = lerp(POSE[0], POSE[1] - 0.08, index / Math.max(1, count - 1))
  const scale = useTransform(progress, [start, start + 0.08], [0, 1])
  const opacity = useTransform(
    progress,
    [start, start + 0.08, GARMENT_RANGE[0], GARMENT_RANGE[1]],
    [0, 1, 1, 0.3],
  )

  return (
    <motion.circle
      cx={joint.x}
      cy={joint.y}
      r="3.4"
      fill="currentColor"
      style={{ scale, opacity, originX: `${joint.x}px`, originY: `${joint.y}px` }}
    />
  )
}

function Bone({
  from,
  to,
  index,
  count,
  progress,
}: {
  from: { x: number; y: number }
  to: { x: number; y: number }
  index: number
  count: number
  progress: MotionValue<number>
}) {
  const start = lerp(POSE[0] + 0.04, POSE[1] - 0.04, index / Math.max(1, count - 1))
  const dashoffset = useTransform(progress, [start, start + 0.1], [1, 0])
  const opacity = useTransform(
    progress,
    [start, start + 0.04, GARMENT_RANGE[0], GARMENT_RANGE[1]],
    [0, 1, 1, 0.25],
  )

  return (
    <motion.line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke="currentColor"
      strokeWidth="1.4"
      pathLength={1}
      strokeDasharray={1}
      style={{ strokeDashoffset: dashoffset, opacity }}
    />
  )
}

export function ARAcquisition({ progress }: { progress: MotionValue<number> }) {
  // Blur-to-sharp is the camera pulling focus, and it is bounded to this one
  // small group -- the only place on the page where an animated filter earns
  // its cost, because here it means something.
  const blurAmount = useTransform(progress, [0.02, CAMERA[1]], [7, 0], {
    clamp: true,
  })
  const figureFilter = useMotionTemplate`blur(${blurAmount}px)`
  const figureOpacity = useTransform(progress, [0, 0.12], [0.25, 1])

  const frameOpacity = useTransform(
    progress,
    [0, 0.07, CAMERA[1], POSE[1]],
    [0, 1, 1, 0.3],
  )
  const scanY = useTransform(progress, CAMERA, [-10, 200])
  const scanOpacity = useTransform(
    progress,
    [0, 0.06, CAMERA[1] - 0.06, CAMERA[1]],
    [0, 1, 1, 0],
  )

  const garmentDraw = useTransform(progress, GARMENT_RANGE, [1, 0])
  const garmentFill = useTransform(
    progress,
    [GARMENT_RANGE[0] + 0.1, GARMENT_RANGE[1]],
    [0, 0.85],
  )

  return (
    <svg
      viewBox="0 0 200 220"
      className="mx-auto h-72 w-full max-w-[17rem] sm:h-80"
      fill="none"
      role="img"
      aria-label="A body outline is found by the camera, mapped with pose landmarks, then covered by a rendered garment."
    >
      {/* Viewfinder. Four corners, not a full box: it frames the subject the
          way a camera does and leaves the figure unenclosed. */}
      <motion.g
        style={{ opacity: frameOpacity }}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="text-bronze-deep dark:text-bronze-light"
      >
        <path d="M10 28V14h14M176 14h14v14M190 192v14h-14M24 206H10v-14" />
      </motion.g>

      <motion.g style={{ opacity: scanOpacity }}>
        <motion.g style={{ y: scanY }}>
          <line
            x1="14"
            y1="0"
            x2="186"
            y2="0"
            stroke="currentColor"
            strokeWidth="1"
            className="text-bronze-deep dark:text-bronze-light"
          />
        </motion.g>
      </motion.g>

      <motion.g
        style={{ filter: figureFilter, opacity: figureOpacity }}
        className="text-ink/70 dark:text-bone/70"
      >
        <path d={FIGURE} stroke="currentColor" strokeWidth="1.5" />
      </motion.g>

      <motion.path
        d={GARMENT}
        className="text-bronze-deep dark:text-bronze-light"
        stroke="currentColor"
        strokeWidth="1.5"
        pathLength={1}
        strokeDasharray={1}
        style={{ strokeDashoffset: garmentDraw }}
      />
      <motion.path
        d={GARMENT}
        className="text-bronze dark:text-bronze-light"
        fill="currentColor"
        style={{ opacity: garmentFill }}
      />

      <g className="text-bronze-deep dark:text-bronze-light">
        {BONES.map(([from, to], index) => (
          <Bone
            key={`${from}-${to}`}
            from={JOINTS[from]}
            to={JOINTS[to]}
            index={index}
            count={BONES.length}
            progress={progress}
          />
        ))}
        {JOINTS.map((joint, index) => (
          <Joint
            key={`${joint.x}-${joint.y}`}
            joint={joint}
            index={index}
            count={JOINTS.length}
            progress={progress}
          />
        ))}
      </g>
    </svg>
  )
}
