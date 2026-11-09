import "./AuthSplit.css";
import "./KralType.css";
import { motion } from "motion/react";
import { useSyncExternalStore, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { DURATION, EASE_OUT } from "../../motion/tokens";
import { Logo } from "../landing-v2/Logo";
import { ShaderBackground, type ShaderColors } from "../ui/ShaderBackground";

const rgb = (hex: number): ShaderColors[number] => [(hex >> 16) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

// Light: the hero's grey, white and red swirl (HeroShader's 0.55 intensity), with more greys and red and white as an accent. The login default intensity (0.09) is too calm to reach the greys. Dark uses the shader's own Obsidian and red default.
const LIGHT = [0x85807c, 0xb3adaa, 0xcb1c2b, 0x5e5859, 0x85807c, 0xeeeced, 0xcb1c2b, 0x85807c].map(rgb);

// The `dark` class on <html> is the one source of truth for the theme (ThemeProvider writes it), so the shader follows it live.
const isLight = () => !document.documentElement.classList.contains("dark");
const watchTheme = (notify: () => void) => {
  const observer = new MutationObserver(notify);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};

/** Shared by login and sign up: a photo panel on the left, the form over the KRAL shader on the right. */
export function AuthSplit({
  children,
  photo = true,
}: {
  children: ReactNode;
  /** false: no photo panel, the form sits in the middle of the shader and the theme toggle is hidden (forgot password, sign up success). */
  photo?: boolean;
}) {
  const light = useSyncExternalStore(watchTheme, isLight);
  return (
    <div
      className={`kral-login kral-type relative grid min-h-svh bg-canvas ${photo ? "lg:grid-cols-2" : "kral-login--bare"}`}
    >
      {photo && (
        <aside className="relative hidden overflow-hidden lg:block">
          <img
            src="/images/login-fitting.webp"
            alt="Tailor taking shoulder measurements on a client in a black top"
            className="absolute inset-0 size-full object-cover object-[25%_50%]"
            fetchPriority="high"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[#161113]/55"
          />
          <div className="relative flex h-full flex-col justify-start gap-3 p-12 text-white">
            <p className="font-display text-5xl leading-[1.05] font-bold tracking-[-0.02em]">
              Find your fit.
              <br />
              Wear your identity.
            </p>
            <p className="text-base">Made to represent.</p>
          </div>
        </aside>
      )}
      <div className="relative flex items-center justify-center overflow-hidden px-4 py-14 max-[359px]:px-3 sm:px-6 lg:py-16">
        <div aria-hidden="true" className="absolute inset-0 z-0">
          <ShaderBackground colors={photo && light ? LIGHT : undefined} intensity={photo && light ? 0.55 : undefined} />
          <div className="kral-scrim absolute inset-0" />
        </div>
        <Link
          to="/"
          aria-label="KRAL home"
          className="kral-logo tap absolute top-5 right-4 z-10 -m-3 p-3 text-fg transition-colors duration-250 ease-out hover:text-[#CB1C2B] focus-visible:text-[#CB1C2B] motion-reduce:transition-none sm:right-6"
        >
          <Logo className="h-5 w-auto fill-current sm:h-6" />
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
