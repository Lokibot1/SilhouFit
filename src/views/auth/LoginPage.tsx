import { motion } from "motion/react";
import { Link, useSearchParams } from "react-router-dom";
import { FloatingField } from "../../components/form/FloatingField";
import { GoogleButton } from "../../components/form/GoogleButton";
import {
  AlertIcon,
  CheckIcon,
  LockIcon,
  MailIcon,
  SpinnerIcon,
} from "../../components/form/icons";
import { SilhouetteMark } from "../../components/landing/SilhouetteMark";
import { PRIMARY_BUTTON } from "../../components/ui/buttonStyles";
import {
  fieldId,
  SIGN_IN_ERROR_COPY,
  useLoginForm,
} from "../../hooks/useLoginForm";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useMetaDescription } from "../../hooks/useMetaDescription";
import { DURATION, EASE_OUT } from "../../motion/tokens";
import type { LoginField } from "../../utils/loginValidation";
import { nextQuery } from "../../utils/safeNext";

const META_DESCRIPTION =
  "Sign in to SilhouFit to open your saved fit profile, pick up AR fitting where you left off and shop boutiques and online with one secure SilhouFit account.";

const GAPS = "[&>*+*]:mt-4 short:[&>*+*]:mt-3";

export function LoginPage() {
  useDocumentTitle("Sign in — SilhouFit");
  useMetaDescription(META_DESCRIPTION);

  const {
    values,
    remember,
    setRemember,
    errors,
    status,
    errorKind,
    locked,
    method,
    setField,
    blurField,
    onSubmit,
    onGoogle,
  } = useLoginForm();
  const pending = status === "pending";
  const next = nextQuery(useSearchParams()[0].get("next"));

  const field = (name: LoginField) => ({
    id: fieldId(name),
    value: values[name],
    error: errors[name],
    readOnly: pending,
    onChange: (value: string) => setField(name, value),
    onBlur: () => blurField(name),
  });

  const banner = locked
    ? {
        title: "Too many attempts. Try again in 30 seconds.",
        body: "Sign-in is paused to protect your account. You can also reset your password.",
      }
    : status === "invalid"
      ? {
          title: "We couldn't sign you in.",
          body: "The email or password doesn't match our records. Check both and try again, or reset your password.",
        }
      : status === "error"
        ? SIGN_IN_ERROR_COPY[errorKind]
        : null;

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4 py-14 max-[359px]:px-3 sm:px-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.shift, ease: EASE_OUT }}
        className="glass-card glass-elevated w-full max-w-md rounded-2xl px-4 py-4 wrap-break-word max-[359px]:px-3 sm:px-6 sm:py-6 short:py-4"
      >
        <form
          noValidate
          onSubmit={onSubmit}
          aria-busy={pending}
          className={GAPS}
        >
          <div className="flex flex-col gap-5 pb-2 short:gap-3">
            <div className="flex flex-col items-center gap-2 shortest:hidden">
              <span className="flex size-16 items-center justify-center rounded-2xl bg-fg shadow-sm short:size-12">
                <SilhouetteMark className="h-12 w-9 text-canvas short:h-9 short:w-7 [&>path]:stroke-[4]" />
              </span>
              <span className="font-display text-xl leading-none font-bold tracking-[-0.02em] text-fg">
                SilhouFit
              </span>
            </div>
            <div>
              <h1 className="display text-left text-3xl text-fg sm:text-4xl">
                Login
              </h1>
              <p className="mt-2 text-sm leading-snug text-fg-muted">
                Pick up your fit profile and AR fittings.
              </p>
            </div>
          </div>
          <FloatingField
            {...field("email")}
            label="Email"
            type="email"
            icon={<MailIcon size={16} />}
            autoComplete="email"
            inputMode="email"
            enterKeyHint="next"
          />
          <FloatingField
            {...field("password")}
            label="Password"
            type="password"
            icon={<LockIcon size={16} />}
            autoComplete="current-password"
            enterKeyHint="done"
          />
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <label className="relative flex min-h-11 cursor-pointer items-center gap-2.5 text-sm whitespace-nowrap text-fg-muted">
              <input
                type="checkbox"
                checked={remember}
                disabled={pending}
                onChange={(event) => setRemember(event.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-200 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-chrome-strong ${
                  remember
                    ? "border-fg bg-fg text-canvas"
                    : "border-line-strong"
                }`}
              >
                {remember && <CheckIcon />}
              </span>
              Remember me
            </label>
            <Link
              to="/forgot-password"
              className="flex min-h-11 items-center text-sm whitespace-nowrap text-fg-muted underline-offset-2 hover:text-chrome-strong hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          {banner && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm leading-snug"
            >
              <AlertIcon size={20} className="mt-px text-danger" />
              <p>
                <strong className="block font-semibold text-fg">
                  {banner.title}
                </strong>
                <span className="text-fg-muted">{banner.body}</span>
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={pending || locked}
            className={`${PRIMARY_BUTTON} w-full`}
          >
            {pending && method === "email" ? (
              <>
                <SpinnerIcon />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <div
            className="flex items-center gap-3 text-xs text-fg-muted"
            aria-hidden="true"
          >
            <span className="h-px flex-1 bg-line-strong" />
            or continue with
            <span className="h-px flex-1 bg-line-strong" />
          </div>
          <GoogleButton
            onClick={onGoogle}
            pending={pending && method === "google"}
            label="Sign in with Google"
          />

          <p className="flex flex-wrap items-center justify-center gap-x-1 text-sm text-fg-muted">
            Not a member yet?{" "}
            <Link
              to={`/signup${next}`}
              className="flex min-h-11 items-center font-medium text-fg underline underline-offset-2 hover:text-chrome-strong"
            >
              Join us today!
            </Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
}
