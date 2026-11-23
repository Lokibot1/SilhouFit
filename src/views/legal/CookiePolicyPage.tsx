import {
  LegalPageLayout,
  LegalSection,
} from '../../components/legal/LegalPageLayout'
import { Bullets, Lead } from '../../components/legal/legalParts'

export function CookiePolicyPage() {
  return (
    <LegalPageLayout
      title="Cookie policy"
      lastUpdated="November 3, 2026"
      scopeNote="This Cookie Policy sets out how SilhouFit utilizes cookies, web storage, and related tracking scripts on the SilhouFit website (silhoufit.com) in compliance with the Data Privacy Act of 2012."
    >
      <LegalSection heading="Scope & definitions">
        <p>
          Cookies are small data files placed on your browser or device memory
          when accessing web services. They enable system security, persist
          shopping cart sessions, retain sizing preferences, and provide
          analytical telemetry on platform use.
        </p>
      </LegalSection>

      <LegalSection heading="Classification of cookies">
        <Bullets>
          <li>
            <Lead>Strictly Necessary:</Lead> Critical for system uptime,
            account session validation, anti-CSRF tokens, and cart retention
            (e.g., auth_token, csrf_protection, cart_id). Mandatory (cannot be
            disabled without system malfunction).
          </li>
          <li>
            <Lead>Functional / Preferences:</Lead> Retains user configurations
            such as UI theme (dark/light mode), interface language, and
            dismissals (e.g., ui_theme, onboarding_dismissed). Optional via
            cookie settings.
          </li>
          <li>
            <Lead>Analytics & Performance:</Lead> Gathers aggregated,
            non-personally identifiable telemetry to measure site performance
            and popular sizing trends. Optional via cookie banner.
          </li>
          <li>
            <Lead>Marketing / Re-targeting:</Lead> Measures performance of
            authorized fashion campaigns and promotional events. Opt-in
            required.
          </li>
        </Bullets>
      </LegalSection>

      <LegalSection heading="Cookie lifespans & management">
        <Bullets>
          <li>
            <Lead>Session Cookies:</Lead> Automatically wiped when you
            terminate your web browser session.
          </li>
          <li>
            <Lead>Persistent Cookies:</Lead> Remain stored on your device for a
            predetermined period (up to 12 months) unless manually purged.
          </li>
          <li>
            <Lead>Security Flags:</Lead> Sensitive session and authentication
            cookies utilize HttpOnly, Secure, and SameSite=Strict flags to
            defend against Cross-Site Scripting (XSS) and unauthorized token
            transmission.
          </li>
          <li>
            <Lead>Opt-Out & Browser Controls:</Lead> You can modify cookie
            preferences at any time via the cookie settings panel on the
            SilhouFit website (silhoufit.com) or through your browser
            settings. Disabling strictly necessary cookies may prevent
            checkout and account operations.
          </li>
        </Bullets>
      </LegalSection>
    </LegalPageLayout>
  )
}
