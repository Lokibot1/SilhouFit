import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { LockIcon, SettingsIcon } from '../../components/form/icons'
import { ChangePasswordSheet } from '../../components/profile/ChangePasswordSheet'
import { KRAL_BLOCK, KRAL_BODY, KRAL_H2, KRAL_PANEL, KRAL_WRAP } from '../../components/profile/profileKral'
import { PROFILE_CARD, PROFILE_SHELL } from '../../components/profile/ProfileSkeleton'
import { ShopHeader } from '../../components/shop/ShopHeader'
import { KRAL_SECONDARY } from '../../components/shop/shopControls'
import { useToast } from '../../components/toast/useToast'
import { SECONDARY_BUTTON } from '../../components/ui/buttonStyles'
import { SegmentedTabs } from '../../components/ui/SegmentedTabs'
import { Switch } from '../../components/ui/Switch'
import { useTheme } from '../../contexts/ThemeContext'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { hasPasswordLogin } from '../../service/changePassword'
import { peekLoginNotice } from '../../service/loginNotice'
import { popupsOn, setNotificationPref, soundOn, type NotificationPref } from '../../service/notificationPrefs'
import { isStaffRole } from '../../utils/staffRole'

const META_DESCRIPTION =
  'Choose light, dark or system theme, turn notification pop-ups and sounds on or off for this device, and change the password you use to sign in to SilhouFit.'

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const

function Section({ kral, title, children }: { kral: boolean; title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={`${kral ? KRAL_PANEL : PROFILE_CARD} grid gap-4`}>
      <h2 className={kral ? KRAL_H2 : 'display text-xl text-fg'}>{title}</h2>
      {children}
    </section>
  )
}

const ALERTS: { key: NotificationPref; label: string; help: string }[] = [
  { key: 'popup', label: 'Pop-up alerts', help: 'Show a banner when a new notification arrives, on this device.' },
  { key: 'sound', label: 'Notification sound', help: 'Play a short chime when a new notification arrives, on this device.' },
]

/** `tone="kral"` is the customer page; staff, admin and owner pages render it unset and keep the glass look. */
export function SettingsPage({ tone }: { tone?: 'kral' }) {
  const kral = tone === 'kral'
  useDocumentTitle('Settings — SilhouFit')
  useMetaDescription(META_DESCRIPTION)

  const { pathname } = useLocation()
  const user = useCurrentUser()
  const toast = useToast()
  const { preference, setPreference } = useTheme()
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Signed in when the page opened: losing the session later (Sign out in the navbar) ends at the login page.
  const [hadUser] = useState(user !== null)
  const [on, setOn] = useState({ popup: popupsOn(), sound: soundOn() })
  const [changingPassword, setChangingPassword] = useState(false)
  // null while we find out how the account signs in; an account that signs in only with Google has no password to change.
  const [passwordLogin, setPasswordLogin] = useState<boolean | null>(null)

  useEffect(() => {
    void hasPasswordLogin().then(setPasswordLogin)
  }, [])

  useEffect(() => {
    // The tour's welcome card may already hold focus; the heading must not take it back.
    if (!document.querySelector('[aria-modal="true"]')) headingRef.current?.focus()
  }, [])

  // Staff roles see their settings inside their own sidebar shell.
  if (user && isStaffRole(user.role) && !pathname.startsWith(`/${user.role}/`)) {
    return <Navigate to={`/${user.role}/settings`} replace />
  }

  if (!user) {
    return <Navigate to={hadUser || peekLoginNotice() ? '/login' : '/login?next=%2Fsettings'} replace />
  }

  function toggle(key: NotificationPref, label: string, next: boolean) {
    setNotificationPref(key, next)
    setOn((current) => ({ ...current, [key]: next }))
    toast.show({ kind: 'success', message: `${label} turned ${next ? 'on' : 'off'}` })
  }

  const text = kral ? 'font-kral-mono text-kral-fg' : 'text-fg'
  const muted = kral ? KRAL_BODY : 'text-base leading-relaxed text-fg-muted'

  const sections = (
    <div className="grid gap-6">
      <Section kral={kral} title="Appearance">
        <div>
          <SegmentedTabs label="Theme" name="theme" options={THEMES} value={preference} onChange={setPreference} />
        </div>
        <p className={muted}>System follows your device, and changes when it does.</p>
      </Section>
      <Section kral={kral} title="Notifications on this device">
        {ALERTS.map(({ key, label, help }) => (
          <label key={key} className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
            <span className="min-w-0">
              <span className={`block text-base font-semibold ${text}`}>{label}</span>
              <span className={`block ${muted}`}>{help}</span>
            </span>
            <Switch label={label} checked={on[key]} onChange={(next) => toggle(key, label, next)} />
          </label>
        ))}
      </Section>
      <Section kral={kral} title="Security">
        {passwordLogin === null ? (
          <div role="status" aria-label="Checking how you sign in" className={`h-11 w-44 animate-pulse ${kral ? KRAL_BLOCK : 'rounded-xl bg-line-strong'}`} />
        ) : passwordLogin ? (
          <div>
            <button type="button" onClick={() => setChangingPassword(true)} className={`${kral ? KRAL_SECONDARY : `${SECONDARY_BUTTON} gap-2`} w-fit`}>
              <LockIcon size={16} />
              Change password
            </button>
          </div>
        ) : (
          <p role="note" className={muted}>
            You sign in with Google, so there is no password to change here.
          </p>
        )}
      </Section>
      {passwordLogin && <ChangePasswordSheet tone={tone} open={changingPassword} onClose={() => setChangingPassword(false)} />}
    </div>
  )

  if (kral) {
    return (
      <>
        <ShopHeader tone="kral" ref={headingRef} title="Settings" crumb="Settings" icon={<SettingsIcon className="size-[1.1em]" />} />
        <div className={KRAL_WRAP}>{sections}</div>
      </>
    )
  }
  return (
    <div className={PROFILE_SHELL}>
      <h1 ref={headingRef} tabIndex={-1} className="display mb-6 text-3xl text-fg outline-none sm:text-4xl">
        Settings
      </h1>
      {sections}
    </div>
  )
}
