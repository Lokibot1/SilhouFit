import { Link } from "react-router-dom";
import { AuthHeading } from "./AuthSplit";
import { FloatingField } from "../form/FloatingField";
import { GoogleButton } from "../form/GoogleButton";
import { AlertIcon, CheckIcon, LockIcon, MailIcon, SpinnerIcon } from "../form/icons";
import { PRIMARY_BUTTON } from "../ui/buttonStyles";
import { fieldId, SIGN_IN_ERROR_COPY, useLoginForm } from "../../hooks/useLoginForm";
import type { LoginField } from "../../utils/loginValidation";
import { nextQuery } from "../../utils/safeNext";

const ARCHIVED_COPY = {
  title: "This account has been deactivated.",
  body: "Contact an administrator to have it activated again.",
};

const SWITCH_LINK =
  "flex min-h-11 cursor-pointer items-center font-medium text-fg lg:pointer-fine:min-h-9 underline underline-offset-2 hover:text-chrome-strong";

const GAPS = "[&>*+*]:mt-4 short:[&>*+*]:mt-3 lg:[&>*+*]:mt-3";

interface LoginFormProps {
  /** Where to go after signing in (`?next=`), as the login page reads it from the address bar. */
  nextParam: string | null;
  /** In the sign-in modal: no page heading, and signing in closes the modal instead of navigating. */
  modal?: boolean;
  onSignedIn?: () => void;
  /** In the modal: swap to the sign-up form instead of leaving for the sign-up page. */
  onSwitch?: () => void;
  archived?: boolean;
  notice?: string | null;
}

/** The sign-in form, shared by the login page and the sign-in modal. */
export function LoginForm({ nextParam, modal = false, onSignedIn, onSwitch, archived = false, notice = null }: LoginFormProps) {
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
  } = useLoginForm({ next: nextParam, onSignedIn });
  const pending = status === "pending";
  const next = nextQuery(nextParam);
  const passwordChanged = notice === "password-changed";
  const sessionEnded = notice === "session-ended";

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
      : status === "archived"
        ? ARCHIVED_COPY
        : status === "error"
          ? SIGN_IN_ERROR_COPY[errorKind]
          : archived
            ? ARCHIVED_COPY
            : null;

  return (
      <form noValidate onSubmit={onSubmit} aria-busy={pending} className={GAPS}>
        {!modal && <AuthHeading title="Welcome Back!" subtitle="Sign in your account." />}
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
          <label className="relative flex min-h-11 cursor-pointer items-center gap-2.5 text-sm lg:pointer-fine:min-h-9 whitespace-nowrap text-fg-muted">
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
                remember ? "border-fg bg-fg text-canvas" : "border-line-strong"
              }`}
            >
              {remember && <CheckIcon />}
            </span>
            Remember me
          </label>
          <Link
            to="/forgot-password"
            className="flex min-h-11 items-center text-sm whitespace-nowrap lg:pointer-fine:min-h-9 text-fg-muted underline-offset-2 hover:text-chrome-strong hover:underline"
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

        {sessionEnded && !banner && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-base leading-snug sm:text-sm"
          >
            <AlertIcon size={20} className="mt-px shrink-0 text-danger" />
            <p>
              <strong className="block font-semibold text-fg">
                Your session ended.
              </strong>
              <span className="text-fg-muted">Sign in again to carry on where you were.</span>
            </p>
          </div>
        )}

        {passwordChanged && !banner && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-base leading-snug sm:text-sm"
          >
            <CheckIcon size={20} className="mt-px shrink-0 text-success" />
            <p>
              <strong className="block font-semibold text-fg">
                Password changed.
              </strong>
              <span className="text-fg-muted">Sign in with your new password.</span>
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
          {onSwitch ? (
            <button type="button" onClick={onSwitch} className={SWITCH_LINK}>
              Join us today!
            </button>
          ) : (
            <Link to={`/signup${next}`} className={SWITCH_LINK}>
              Join us today!
            </Link>
          )}
        </p>
      </form>
  );
}
