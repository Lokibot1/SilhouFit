import "./LoginPage.css";
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
import { Logo } from "../../components/landing-v2/Logo";
import { PRIMARY_BUTTON } from "../../components/ui/buttonStyles";
import { ShaderBackground } from "../../components/ui/ShaderBackground";
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
  "Sign in to KRAL to open your saved fit profile, pick up AR fitting where you left off and shop boutiques and online with one secure KRAL account.";

const ARCHIVED_COPY = {
  title: "This account has been archived.",
  body: "Contact an administrator to have it restored.",
};

const GAPS = "[&>*+*]:mt-4 short:[&>*+*]:mt-3";

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
    <div className="kral-login relative grid min-h-svh bg-canvas lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden lg:block">
        <img
          src="/images/login-fitting.webp"
          alt="Tailor taking shoulder measurements on a client in a black top"
          className="absolute inset-0 size-full object-cover object-[25%_50%]"
          fetchPriority="high"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-[#161113]/55" />
        <div className="relative flex h-full flex-col justify-start gap-3 p-12 text-white">
          <p className="font-display text-5xl leading-[1.05] font-bold tracking-[-0.02em]">
            Find your fit.
            <br />
            Wear your identity.
          </p>
          <p className="text-base">Made to represent.</p>
        </div>
      </aside>
      <div className="relative flex items-center justify-center overflow-hidden px-4 py-14 max-[359px]:px-3 sm:px-6">
        <div aria-hidden="true" className="absolute inset-0 z-0">
          <ShaderBackground />
        </div>
        <Link
          to="/"
          aria-label="KRAL home"
          className="tap absolute top-5 right-16 z-10 sm:right-20"
        >
          <Logo className="h-5 w-auto fill-fg sm:h-6" />
        </Link>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: DURATION.shift, ease: EASE_OUT }}
          className="relative z-10 w-full max-w-md wrap-break-word"
        >
          <form
            noValidate
            onSubmit={onSubmit}
            aria-busy={pending}
            className={GAPS}
          >
            <div className="border-b border-line-strong pb-5">
              <h1 className="display text-left text-3xl text-fg sm:text-4xl">
                Welcome Back!
              </h1>
              <p className="mt-3 text-base leading-snug text-fg-muted">
                Sign in your account.
              </p>
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
    </div>
  );
}
