import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthHeading, AuthSplit } from "../../components/auth/AuthSplit";
import { FloatingField } from "../../components/form/FloatingField";
import { GoogleButton } from "../../components/form/GoogleButton";
import {
  AlertIcon,
  CheckIcon,
  LockIcon,
  MailIcon,
  SpinnerIcon,
} from "../../components/form/icons";
import { PRIMARY_BUTTON } from "../../components/ui/buttonStyles";
import {
  fieldId,
  SIGN_IN_ERROR_COPY,
  useLoginForm,
} from "../../hooks/useLoginForm";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useMetaDescription } from "../../hooks/useMetaDescription";
import { peekLoginNotice, takeLoginNotice } from "../../service/loginNotice";
import type { LoginField } from "../../utils/loginValidation";
import { nextQuery } from "../../utils/safeNext";

const META_DESCRIPTION =
  "Sign in to KRAL to open your saved fit profile, pick up AR fitting where you left off and shop boutiques online with one secure KRAL account on any device.";

const ARCHIVED_COPY = {
  title: "This account has been deactivated.",
  body: "Contact an administrator to have it activated again.",
};

const GAPS = "[&>*+*]:mt-4 short:[&>*+*]:mt-3 lg:[&>*+*]:mt-3";

export function LoginPage() {
  useDocumentTitle("Sign in — KRAL");
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
  const params = useSearchParams()[0];
  const next = nextQuery(params.get("next"));
  // Kept for this visit; the one-shot notice is cleared so a reload or a later sign-out does not repeat it.
  const [notice] = useState(peekLoginNotice);
  const passwordChanged = notice === "password-changed";
  const sessionEnded = notice === "session-ended";
  useEffect(() => {
    takeLoginNotice();
  }, []);

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
          : params.get("archived") === "1"
            ? ARCHIVED_COPY
            : null;

  return (
    <AuthSplit>
      <form noValidate onSubmit={onSubmit} aria-busy={pending} className={GAPS}>
        <AuthHeading title="Welcome Back!" subtitle="Sign in your account." />
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
          <label className="relative flex min-h-11 cursor-pointer items-center gap-2.5 text-sm lg:min-h-9 whitespace-nowrap text-fg-muted">
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
            className="flex min-h-11 items-center text-sm whitespace-nowrap lg:min-h-9 text-fg-muted underline-offset-2 hover:text-chrome-strong hover:underline"
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
          <Link
            to={`/signup${next}`}
            className="flex min-h-11 items-center font-medium text-fg lg:min-h-9 underline underline-offset-2 hover:text-chrome-strong"
          >
            Join us today!
          </Link>
        </p>
      </form>
    </AuthSplit>
  );
}
