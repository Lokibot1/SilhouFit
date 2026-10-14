import { AnimatePresence } from 'motion/react'
import { lazy, Suspense, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { LandingCometCursor } from './components/CometCursor'
import { IntroLoader } from './components/IntroLoader'
import { CallbackSkeleton } from './components/form/CallbackSkeleton'
import { LoginSkeleton } from './components/form/LoginSkeleton'
import { SignUpSkeleton } from './components/form/SignUpSkeleton'
import { CheckoutRouteFallback } from './components/checkout/CheckoutSkeleton'
import { Layout } from './components/Layout'
import { ProfileSkeleton } from './components/profile/ProfileSkeleton'
import { ProductRouteSkeleton } from './components/shop/ProductSkeleton'
import { CartSkeleton, ShopSkeleton, WishlistSkeleton } from './components/shop/ShopSkeleton'
import { AboutPage } from './views/public/AboutPage'
import { CookiePolicyPage } from './views/legal/CookiePolicyPage'
import { LandingPage } from './views/public/LandingPage'
import { NotFoundPage } from './views/public/NotFoundPage'
import { PrivacyPolicyPage } from './views/legal/PrivacyPolicyPage'
import { RefundPolicyPage } from './views/legal/RefundPolicyPage'
import { TermsOfServicePage } from './views/legal/TermsOfServicePage'

const SignUpPage = lazy(() =>
  import('./views/auth/SignUpPage').then((m) => ({ default: m.SignUpPage })),
)

const LoginPage = lazy(() =>
  import('./views/auth/LoginPage').then((m) => ({ default: m.LoginPage })),
)
const AuthCallbackPage = lazy(() =>
  import('./views/auth/AuthCallbackPage').then((m) => ({ default: m.AuthCallbackPage })),
)
const ForgotPasswordPage = lazy(() =>
  import('./views/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
)

const ShopPage = lazy(() =>
  import('./views/public/ShopPage').then((m) => ({ default: m.ShopPage })),
)

const ProductPage = lazy(() =>
  import('./views/public/ProductPage').then((m) => ({ default: m.ProductPage })),
)

const WishlistPage = lazy(() =>
  import('./views/private/WishlistPage').then((m) => ({ default: m.WishlistPage })),
)

const CartPage = lazy(() =>
  import('./views/private/CartPage').then((m) => ({ default: m.CartPage })),
)

const CheckoutPage = lazy(() =>
  import('./views/private/CheckoutPage').then((m) => ({ default: m.CheckoutPage })),
)
const OrderSuccessPage = lazy(() =>
  import('./views/private/OrderSuccessPage').then((m) => ({ default: m.OrderSuccessPage })),
)

const ProfilePage = lazy(() =>
  import('./views/private/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function App() {
  const { pathname } = useLocation()
  const [introDone, setIntroDone] = useState(prefersReducedMotion() || pathname !== '/')

  return (
    <>
      <LandingCometCursor />
      <AnimatePresence>
        {!introDone && (
          <IntroLoader key="intro" onFinished={() => setIntroDone(true)} />
        )}
      </AnimatePresence>

      <div inert={!introDone} aria-hidden={!introDone}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<LandingPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route
              path="signup"
              element={
                <Suspense fallback={<SignUpSkeleton />}>
                  <SignUpPage />
                </Suspense>
              }
            />
            <Route
              path="login"
              element={
                <Suspense fallback={<LoginSkeleton />}>
                  <LoginPage />
                </Suspense>
              }
            />
            <Route
              path="auth/callback"
              element={
                <Suspense fallback={<CallbackSkeleton />}>
                  <AuthCallbackPage />
                </Suspense>
              }
            />
            <Route
              path="forgot-password"
              element={
                <Suspense fallback={<LoginSkeleton short />}>
                  <ForgotPasswordPage />
                </Suspense>
              }
            />
            <Route
              path="shop"
              element={
                <Suspense fallback={<ShopSkeleton />}>
                  <ShopPage />
                </Suspense>
              }
            />
            <Route
              path="shop/:id"
              element={
                <Suspense fallback={<ProductRouteSkeleton />}>
                  <ProductPage />
                </Suspense>
              }
            />
            <Route
              path="wishlist"
              element={
                <Suspense fallback={<WishlistSkeleton />}>
                  <WishlistPage />
                </Suspense>
              }
            />
            <Route
              path="cart"
              element={
                <Suspense fallback={<CartSkeleton />}>
                  <CartPage />
                </Suspense>
              }
            />
            <Route
              path="checkout"
              element={
                <Suspense fallback={<CheckoutRouteFallback />}>
                  <CheckoutPage />
                </Suspense>
              }
            />
            <Route
              path="checkout/success"
              element={
                <Suspense fallback={<CheckoutRouteFallback />}>
                  <OrderSuccessPage />
                </Suspense>
              }
            />
            <Route
              path="profile"
              element={
                <Suspense fallback={<ProfileSkeleton />}>
                  <ProfilePage />
                </Suspense>
              }
            />
            <Route path="privacy-policy" element={<PrivacyPolicyPage />} />
            <Route path="terms-of-service" element={<TermsOfServicePage />} />
            <Route path="refund-policy" element={<RefundPolicyPage />} />
            <Route path="cookie-policy" element={<CookiePolicyPage />} />
          </Route>
          <Route element={<Layout bare />}>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </div>
    </>
  )
}

export default App
