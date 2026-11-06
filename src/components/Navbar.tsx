import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { DURATION, EASE_OUT } from "../motion/tokens";
import { isAuthPath } from "../utils/authRoutes";
import { AccountLink } from "./AccountLink";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";
const NAV_LINKS = [
  { label: "About Us", href: "/about" },
  { label: "Shop", href: "/shop" },
];

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [solid, setSolid] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { pathname } = useLocation();
  const authPage = isAuthPath(pathname);
  // Login, sign up, forgot password and the Google callback carry their own logo beside the form.
  const hideBrand = [
    "/login",
    "/signup",
    "/forgot-password",
    "/auth/callback",
  ].includes(pathname.replace(/\/$/, ""));
  // Login and sign up keep the logo in the top-right corner, so the theme toggle sits in the bottom-right instead.
  const toggleAtCorner = ["/login", "/signup"].includes(
    pathname.replace(/\/$/, ""),
  );
  const user = useCurrentUser();

  const { scrollY, scrollYProgress } = useScroll();
  useMotionValueEvent(scrollY, "change", (value) => setSolid(value > 24));

  useEffect(() => {
    if (!menuOpen) return;

    const panel = menuRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      "a, button:not([disabled])",
    );
    focusable?.[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }

      if (event.key !== "Tab" || !focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const brandMark = (
    <BrandMark>
      <span className="font-ui block text-xs tracking-[0.22em] max-[359px]:hidden text-fg-muted uppercase transition-colors group-hover:text-chrome-strong">
        Online apparel
      </span>
    </BrandMark>
  );

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top)] transition-colors duration-300 ${
          hideBrand ? "pointer-events-none" : ""
        } ${
          solid
            ? "border-b border-line bg-canvas/85 backdrop-blur-md"
            : authPage
              ? ""
              : "border-b border-transparent"
        }`}
      >
        <div className="relative">
          <nav
            aria-label="Primary"
            className={`mx-auto flex max-w-6xl items-center justify-between pr-[4rem] pl-4 sm:pl-6 sm:pr-[4.5rem] xl:pr-6 transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              solid ? "py-3" : "py-5"
            }`}
          >
            {!hideBrand &&
              (user ? (
                <div className="flex items-center gap-3">{brandMark}</div>
              ) : (
                <Link
                  to="/"
                  className="tap group flex items-center gap-3"
                  onClick={() => setMenuOpen(false)}
                >
                  {brandMark}
                </Link>
              ))}

            {!authPage && (
              <div className="hidden items-center gap-8 lg:flex">
                {NAV_LINKS.map((link) => {
                  const isActive =
                    pathname === link.href ||
                    pathname.startsWith(`${link.href}/`);
                  return (
                    <Link
                      key={link.href}
                      to={link.href}
                      aria-current={isActive ? "true" : undefined}
                      className={`font-ui relative text-xs tracking-[0.16em] uppercase transition-colors ${
                        isActive ? "text-fg" : "text-fg-muted hover:text-fg"
                      }`}
                    >
                      {link.label}
                      <span
                        className={`chrome-fill absolute -bottom-2 left-0 h-px transition-[width,opacity] duration-500 ease-out ${
                          isActive ? "w-full opacity-100" : "w-0 opacity-0"
                        }`}
                      />
                    </Link>
                  );
                })}

                {user ? (
                  <AccountLink user={user} />
                ) : (
                  <Link
                    to="/login"
                    className="pill bg-fg font-medium text-canvas transition-colors hover:bg-chrome-strong"
                  >
                    Login!
                  </Link>
                )}
              </div>
            )}

            {!authPage && (
              <div className="flex items-center gap-2 lg:hidden">
                <button
                  ref={menuButtonRef}
                  type="button"
                  onClick={() => setMenuOpen((open) => !open)}
                  aria-expanded={menuOpen}
                  aria-controls="mobile-menu"
                  className="pill glass-btn glass text-fg"
                >
                  {menuOpen ? "Close" : "Menu"}
                </button>
              </div>
            )}
          </nav>

          {/* Pinned to the corner, centred on the nav row (which resizes on scroll), clear of the
            row's content via the nav's right padding. */}
          {/* auth-toggle-slot: AuthSplit hides it on the pages without a photo, which are always dark. */}
          {!toggleAtCorner && (
            <div className="auth-toggle-slot pointer-events-auto absolute inset-y-0 right-2 z-10 flex items-center sm:right-3">
              <ThemeToggle />
            </div>
          )}
        </div>

        {!authPage && (
          <motion.div
            aria-hidden="true"
            style={{ scaleX: scrollYProgress }}
            className="chrome-fill absolute inset-x-0 bottom-0 h-px origin-left"
          />
        )}

        <AnimatePresence initial={false}>
          {menuOpen && !authPage && (
            <motion.div
              id="mobile-menu"
              ref={menuRef}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: DURATION.state, ease: EASE_OUT }}
              className="overflow-hidden border-t border-line bg-canvas lg:hidden"
            >
              <div className="px-6 pt-4 pb-8">
                {NAV_LINKS.map((link) => {
                  const isActive =
                    pathname === link.href ||
                    pathname.startsWith(`${link.href}/`);
                  return (
                    <Link
                      key={link.href}
                      to={link.href}
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={`font-display block border-b border-line py-4 text-2xl font-semibold tracking-[-0.02em] ${
                        isActive ? "text-fg" : "text-fg-muted"
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
                {user ? (
                  <div className="mt-6">
                    <AccountLink
                      user={user}
                      onNavigate={() => setMenuOpen(false)}
                    />
                  </div>
                ) : (
                  <Link
                    to="/signup"
                    onClick={() => setMenuOpen(false)}
                    className="pill mt-6 bg-fg font-medium text-canvas"
                  >
                    Sign Up now!
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
      {toggleAtCorner && (
        <div className="auth-toggle-slot fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50">
          <ThemeToggle />
        </div>
      )}
    </>
  );
}
