import "./AuthSplit.css";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DURATION, EASE_OUT } from "../../motion/tokens";
import { Logo } from "../landing-v2/Logo";
import { ShaderBackground } from "../ui/ShaderBackground";

/** Shared by login and sign up: a photo panel on the left, the form over the KRAL shader on the right. */
export function AuthSplit({ children }: { children: ReactNode }) {
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
      <div className="relative flex items-center justify-center overflow-hidden px-4 py-14 max-[359px]:px-3 sm:px-6 lg:py-16">
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
          {children}
        </motion.div>
      </div>
    </div>
  );
}

export function AuthHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="border-b border-line-strong pb-4">
      <h1 className="display text-left text-3xl text-fg">{title}</h1>
      <p className="mt-2 text-sm leading-snug text-fg-muted">{subtitle}</p>
    </div>
  );
}
