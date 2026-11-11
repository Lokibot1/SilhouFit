import { AuthHeadingSkeleton, AuthSkeletonShell } from './AuthSkeletonShell'

// Sign in mirrors AuthSplit and the login form so the swap does not shift layout.
// `short` is /forgot-password: heading, one field, two buttons, with no photo panel.
export function LoginSkeleton({ short = false }: { short?: boolean }) {
  if (!short) {
    return (
      <AuthSkeletonShell label="Loading sign in form">
        <div className="[&>*+*]:mt-4 short:[&>*+*]:mt-3 lg:[&>*+*]:mt-3">
          <AuthHeadingSkeleton subtitle="Sign in your account." />
          <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
          <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
          <div className="flex h-11 items-center justify-between max-[318px]:h-22 lg:h-9">
            <div className="h-5 w-32 rounded bg-line" />
            <div className="h-5 w-28 rounded bg-line" />
          </div>
          <div className="h-11 rounded-xl bg-line-strong lg:pointer-fine:h-10" />
          <div className="h-4 rounded bg-line" />
          <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
          <div className="mx-auto h-11 w-56 max-w-full rounded-xl bg-line max-[281px]:h-16 lg:h-9" />
        </div>
      </AuthSkeletonShell>
    )
  }

  return (
    <AuthSkeletonShell label="Loading password reset form" photo={false}>
      <div className="[&>*+*]:mt-4 short:[&>*+*]:mt-3 lg:[&>*+*]:mt-3">
        <AuthHeadingSkeleton
          wraps
          subtitle="Enter the email you signed up with and we'll send you a link to choose a new password."
        />
        <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
        <div className="h-11 rounded-xl bg-line-strong lg:pointer-fine:h-10" />
        <div className="h-11 rounded-xl bg-line lg:pointer-fine:h-10" />
      </div>
    </AuthSkeletonShell>
  )
}
