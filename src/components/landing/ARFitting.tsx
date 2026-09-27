import { ARPipelineDiagram } from './ARPipelineDiagram'

export function ARFitting() {
  return (
    <section
      id="ar-fitting"
      className="measure-field scroll-mt-20 bg-bone-soft dark:bg-ink-soft"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-16 px-6 py-24 lg:grid-cols-2">
        <div className="order-2 lg:order-1">
          <div className="glass rounded-2xl p-8">
            <ARPipelineDiagram className="h-auto w-full text-ink dark:text-bone" />
            <p className="mt-6 text-center text-sm font-medium text-ink/60 dark:text-bone/65">
              Camera feed, pose landmarks, garment scaled to the shopper
            </p>
          </div>
        </div>

        <div className="order-1 max-w-xl lg:order-2">
          <h2 className="font-display text-3xl font-semibold text-ink dark:text-bone">
            One camera is enough.
          </h2>
          <p className="mt-6 text-base leading-relaxed text-ink/70 dark:text-bone/75">
            The fitting module runs entirely in the browser. Pose tracking
            reads body landmarks from the camera feed on the shopper&apos;s
            own device, and a scaled 3D garment model renders over the video
            in real time. The same code path works on a laptop&apos;s
            built-in camera, a desktop with a webcam, or a larger screen with
            a webcam attached.
          </p>
          <p className="mt-4 text-base leading-relaxed text-ink/70 dark:text-bone/75">
            No dedicated kiosk hardware, headset, or app install. Trying the
            fitting module on a shopper&apos;s own phone at home is under
            consideration for a later version and is not part of the current
            build.
          </p>
        </div>
      </div>
    </section>
  )
}
