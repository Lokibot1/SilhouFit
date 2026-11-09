import { AnimatePresence } from 'motion/react'
import { lazy, Suspense, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { IntroLoader } from './components/IntroLoader'
import { CallbackSkeleton } from './components/form/CallbackSkeleton'
import { LoginSkeleton } from './components/form/LoginSkeleton'
import { SignUpSkeleton } from './components/form/SignUpSkeleton'
import { CheckoutRouteFallback } from './components/checkout/CheckoutSkeleton'
import { OrderDetailSkeleton, OrdersSkeleton } from './components/orders/OrdersSkeleton'
import { Layout } from './components/Layout'
import { RouteErrorBoundary } from './components/RouteErrorBoundary'
import { MessagesPageSkeleton, StaffMessagesPageSkeleton } from './components/chat/ChatSkeleton'
import { InventoryPageSkeleton } from './components/staff/InventorySkeleton'
import { OrderLogSkeleton, StaffShellSkeleton } from './components/staff/StaffSkeleton'
import { MeasurementsPageSkeleton } from './components/staff/MeasurementsSkeleton'
import { TransactionsPageSkeleton } from './components/staff/TransactionsSkeleton'
import { ArInsightsPageSkeleton } from './components/admin/ar/ArInsightsSkeleton'
import { PromotionsPageSkeleton } from './components/admin/promotions/PromotionsSkeleton'
import { RefundsPageSkeleton } from './components/admin/refunds/RefundsSkeleton'
import { AccountsPageSkeleton } from './components/admin/users/AccountSkeleton'
import { ToastProvider } from './components/toast/ToastProvider'
import { ProfileSkeleton } from './components/profile/ProfileSkeleton'
import { ProductRouteSkeleton } from './components/shop/ProductSkeleton'
import { CartSkeleton, ShopSkeleton, WishlistSkeleton } from './components/shop/ShopSkeleton'
import { AboutPage } from './views/public/AboutPage'
import { CookiePolicyPage } from './views/legal/CookiePolicyPage'
import { ContactPage } from './views/public/ContactPage'
import { NotFoundPage } from './views/public/NotFoundPage'
import { ServerErrorPage } from './views/public/ServerErrorPage'
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
const SetPasswordPage = lazy(() =>
  import('./views/auth/SetPasswordPage').then((m) => ({ default: m.SetPasswordPage })),
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

const LandingV2Page = lazy(() =>
  import('./views/public/LandingV2Page').then((m) => ({ default: m.LandingV2Page })),
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

const OrdersPage = lazy(() =>
  import('./views/private/OrdersPage').then((m) => ({ default: m.OrdersPage })),
)
const OrderDetailPage = lazy(() =>
  import('./views/private/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })),
)

const ProfilePage = lazy(() =>
  import('./views/private/ProfilePage').then((m) => ({ default: m.ProfilePage })),
)

const MessagesPage = lazy(() =>
  import('./views/private/MessagesPage').then((m) => ({ default: m.MessagesPage })),
)
const StaffMessagesPage = lazy(() =>
  import('./views/staff/StaffMessagesPage').then((m) => ({ default: m.StaffMessagesPage })),
)
const StaffLayout = lazy(() =>
  import('./views/staff/StaffLayout').then((m) => ({ default: m.StaffLayout })),
)
const PermissionsPage = lazy(() =>
  import('./views/superadmin/PermissionsPage').then((m) => ({ default: m.PermissionsPage })),
)
const StaffDashboardPage = lazy(() =>
  import('./views/staff/StaffDashboardPage').then((m) => ({ default: m.StaffDashboardPage })),
)
const StaffInventoryPage = lazy(() =>
  import('./views/staff/StaffInventoryPage').then((m) => ({ default: m.StaffInventoryPage })),
)
const StaffMeasurementsPage = lazy(() =>
  import('./views/staff/StaffMeasurementsPage').then((m) => ({ default: m.StaffMeasurementsPage })),
)
const StaffOnlineOrdersPage = lazy(() =>
  import('./views/staff/StaffOnlineOrdersPage').then((m) => ({ default: m.StaffOnlineOrdersPage })),
)
const ActivityLogsPage = lazy(() =>
  import('./views/admin/ActivityLogsPage').then((m) => ({ default: m.ActivityLogsPage })),
)
const ArInsightsPage = lazy(() =>
  import('./views/admin/ArInsightsPage').then((m) => ({ default: m.ArInsightsPage })),
)
const PromotionsPage = lazy(() =>
  import('./views/admin/PromotionsPage').then((m) => ({ default: m.PromotionsPage })),
)
const RefundsPage = lazy(() =>
  import('./views/admin/RefundsPage').then((m) => ({ default: m.RefundsPage })),
)
const StaffTransactionsPage = lazy(() =>
  import('./views/staff/StaffTransactionsPage').then((m) => ({ default: m.StaffTransactionsPage })),
)

const AdminDashboardPage = lazy(() =>
  import('./views/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
)
const UserManagementPage = lazy(() =>
  import('./views/admin/UserManagementPage').then((m) => ({ default: m.UserManagementPage })),
)

const BodySetupPage = lazy(() =>
  import('./views/private/BodySetupPage').then((m) => ({ default: m.BodySetupPage })),
)

// The profile page has no customer navbar here, so its top padding shrinks to sit under the staff top bar.
function StaffProfile() {
  return (
    <div className="[&>div]:pt-6!">
      <Suspense fallback={<ProfileSkeleton />}>
        <ProfilePage />
      </Suspense>
    </div>
  )
}

// The pages staff and admins share. An admin has all of them under /admin.
const operationsRoutes = (
  <>
    <Route
      path="inventory"
      element={
        <Suspense fallback={<InventoryPageSkeleton />}>
          <StaffInventoryPage />
        </Suspense>
      }
    />
    <Route
      path="measurements"
      element={
        <Suspense fallback={<MeasurementsPageSkeleton />}>
          <StaffMeasurementsPage />
        </Suspense>
      }
    />
    <Route
      path="transactions"
      element={
        <Suspense fallback={<TransactionsPageSkeleton />}>
          <StaffTransactionsPage />
        </Suspense>
      }
    />
    <Route
      path="online-orders"
      element={
        <Suspense fallback={<OrderLogSkeleton />}>
          <StaffOnlineOrdersPage />
        </Suspense>
      }
    />
    <Route
      path="messages"
      element={
        <Suspense fallback={<StaffMessagesPageSkeleton />}>
          <StaffMessagesPage />
        </Suspense>
      }
    />
  </>
)

// The admin tools. A superadmin has them under /superadmin too, and staff reach them under /admin once a superadmin turns them on.
const adminToolRoutes = (
  <>
    <Route
      path="activity-logs"
      element={
        <Suspense fallback={<OrderLogSkeleton />}>
          <ActivityLogsPage />
        </Suspense>
      }
    />
    <Route
      path="ar-insights"
      element={
        <Suspense fallback={<ArInsightsPageSkeleton />}>
          <ArInsightsPage />
        </Suspense>
      }
    />
    <Route
      path="promotions"
      element={
        <Suspense fallback={<PromotionsPageSkeleton />}>
          <PromotionsPage />
        </Suspense>
      }
    />
    <Route
      path="refunds"
      element={
        <Suspense fallback={<RefundsPageSkeleton />}>
          <RefundsPage />
        </Suspense>
      }
    />
    <Route
      path="users"
      element={
        <Suspense fallback={<AccountsPageSkeleton />}>
          <UserManagementPage />
        </Suspense>
      }
    />
  </>
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
      <AnimatePresence>
        {!introDone && (
          <IntroLoader key="intro" onFinished={() => setIntroDone(true)} />
        )}
      </AnimatePresence>

      <div inert={!introDone} aria-hidden={!introDone}>
        <ToastProvider>
          <RouteErrorBoundary resetKey={pathname}>
          <Routes>
            <Route element={<Layout />}>
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
                path="auth/set-password"
                element={
                  <Suspense fallback={<CallbackSkeleton />}>
                    <SetPasswordPage />
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
                path="orders"
                element={
                  <Suspense fallback={<OrdersSkeleton />}>
                    <OrdersPage />
                  </Suspense>
                }
              />
              <Route
                path="orders/:id"
                element={
                  <Suspense fallback={<OrderDetailSkeleton />}>
                    <OrderDetailPage />
                  </Suspense>
                }
              />
              <Route
                path="profile"
                element={
                  <Suspense fallback={<ProfileSkeleton tone="kral" />}>
                    <ProfilePage tone="kral" />
                  </Suspense>
                }
              />
              <Route
                path="profile/measurements"
                element={
                  <Suspense fallback={<ProfileSkeleton tone="kral" />}>
                    <BodySetupPage />
                  </Suspense>
                }
              />
              <Route
                path="messages"
                element={
                  <Suspense fallback={<MessagesPageSkeleton />}>
                    <MessagesPage />
                  </Suspense>
                }
              />
              <Route path="messages/:conversationId" element={<Navigate to="/messages" replace />} />
              <Route path="contact" element={<ContactPage />} />
              <Route path="privacy-policy" element={<PrivacyPolicyPage />} />
              <Route path="terms-of-service" element={<TermsOfServicePage />} />
              <Route path="refund-policy" element={<RefundPolicyPage />} />
              <Route path="cookie-policy" element={<CookiePolicyPage />} />
            </Route>
            <Route
              path="staff"
              element={
                <Suspense fallback={<StaffShellSkeleton />}>
                  <StaffLayout />
                </Suspense>
              }
            >
              <Route index element={<StaffDashboardPage />} />
              {operationsRoutes}
              <Route path="profile" element={<StaffProfile />} />
            </Route>
            <Route
              path="admin"
              element={
                <Suspense fallback={<StaffShellSkeleton />}>
                  <StaffLayout area="admin" />
                </Suspense>
              }
            >
              <Route index element={<AdminDashboardPage />} />
              {operationsRoutes}
              {adminToolRoutes}
              <Route path="profile" element={<StaffProfile />} />
            </Route>
            <Route
              path="superadmin"
              element={
                <Suspense fallback={<StaffShellSkeleton />}>
                  <StaffLayout area="superadmin" />
                </Suspense>
              }
            >
              <Route index element={<AdminDashboardPage />} />
              {operationsRoutes}
              {adminToolRoutes}
              <Route
                path="permissions"
                element={
                  <Suspense fallback={<AccountsPageSkeleton />}>
                    <PermissionsPage />
                  </Suspense>
                }
              />
              <Route path="profile" element={<StaffProfile />} />
            </Route>
            <Route element={<Layout bare />}>
              <Route
                index
                element={
                  <Suspense fallback={<div className="min-h-svh bg-[#161113]" />}>
                    <LandingV2Page />
                  </Suspense>
                }
              />
              <Route path="500" element={<ServerErrorPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
          </RouteErrorBoundary>
        </ToastProvider>
      </div>
    </>
  )
}

export default App
