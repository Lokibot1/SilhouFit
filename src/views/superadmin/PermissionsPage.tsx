import { useState } from 'react'
import { ConfirmDialog } from '../../components/admin/users/ConfirmDialog'
import { STAFF_SECTION } from '../../components/staff/StaffSkeleton'
import { useToast } from '../../components/toast/useToast'
import { PRIMARY_BUTTON_SM, SECONDARY_BUTTON_SM } from '../../components/ui/buttonStyles'
import { Tooltip } from '../../components/ui/Tooltip'
import { ACCOUNTS_SAMPLE_DATA } from '../../config/accountPolicy'
import { PAGE_GROUPS, PERMISSION_ROLES, type PageKey, type PermissionRole } from '../../config/pagePermissions'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { useMetaDescription } from '../../hooks/useMetaDescription'
import { usePermissions } from '../../hooks/usePermissions'
import { resetPermissions, setRolePermissions } from '../../service/permissionStore'

const META_DESCRIPTION =
  'Choose which SilhouFit pages customers, staff and admins can open. Turn pages on or off per role, select every page at once, and save the changes for that role.'

/** A native checkbox drawn as a switch, so keyboard and screen readers work as for any checkbox. */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label?: string }) {
  return (
    <span className="relative inline-flex h-5 w-9 shrink-0">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0" />
      <span aria-hidden="true" className="absolute inset-0 rounded-full bg-line-strong transition-colors peer-checked:bg-chrome-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fg motion-reduce:transition-none" />
      <span aria-hidden="true" className="absolute top-0.5 left-0.5 size-4 rounded-full bg-canvas shadow-sm transition-transform peer-checked:translate-x-4 motion-reduce:transition-none" />
    </span>
  )
}
const ROW = 'font-ui flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 text-sm text-fg hover:bg-fg/10'

const sameSet = (a: PageKey[], b: PageKey[]) => a.length === b.length && a.every((key) => b.includes(key))

function RoleCard({ role, label, description }: { role: PermissionRole; label: string; description: string }) {
  const toast = useToast()
  const saved = usePermissions()[role]
  const groups = PAGE_GROUPS.filter((group) => group.roles.includes(role))
  const every = groups.flatMap((group) => group.pages.map((page) => page.key))
  const [draft, setDraft] = useState<PageKey[]>(saved)
  const dirty = !sameSet(draft, saved)
  const all = every.every((key) => draft.includes(key))

  const toggle = (keys: PageKey[], on: boolean) =>
    setDraft((old) => (on ? [...old, ...keys.filter((key) => !old.includes(key))] : old.filter((key) => !keys.includes(key))))

  function save() {
    setRolePermissions(role, draft)
    toast.show({ kind: 'success', message: `${label} permissions saved` })
  }

  return (
    <section aria-labelledby={`perm-${role}`} className={`${STAFF_SECTION} grid gap-4 p-4 sm:p-5`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`perm-${role}`} className="display text-lg text-fg">
            {label}
          </h2>
          <p className="mt-1 max-w-prose text-xs text-fg-muted">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="font-ui flex min-h-11 cursor-pointer items-center gap-2 text-xs font-medium text-fg-muted">
            Select all
            <Switch checked={all} onChange={(on) => toggle(every, on)} />
          </label>
          <button type="button" onClick={save} disabled={!dirty} className={PRIMARY_BUTTON_SM}>
            Save changes
          </button>
        </div>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map((group) => {
          const keys = group.pages.map((page) => page.key)
          const groupOn = keys.every((key) => draft.includes(key))
          return (
            <fieldset key={group.id} className="min-w-0 rounded-xl border border-line p-3">
              <legend className="sr-only">{group.label}</legend>
              <label className="font-ui flex min-h-11 cursor-pointer items-center justify-between gap-3 border-b border-line px-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
                {group.label}
                <Switch checked={groupOn} onChange={(on) => toggle(keys, on)} label={`All ${group.label} pages for ${label}`} />
              </label>
              <ul className="mt-1 grid">
                {group.pages.map((page) => (
                  <li key={page.key}>
                    <label className={ROW}>
                      {page.label}
                      <Switch checked={draft.includes(page.key)} onChange={(on) => toggle([page.key], on)} />
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )
        })}
      </div>
    </section>
  )
}

export function PermissionsPage() {
  useDocumentTitle('Permissions — SilhouFit')
  useMetaDescription(META_DESCRIPTION)
  const toast = useToast()
  // Remounting the cards drops any unsaved changes, so they show the defaults that were just saved.
  const [version, setVersion] = useState(0)
  const [asking, setAsking] = useState(false)

  return (
    <div className="grid gap-3">
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-xl text-fg sm:text-2xl">Permissions</h1>
          <p className="mt-1 text-sm text-fg-muted">Choose the pages each role can open. Superadmins always see every page, and dashboards and profiles stay on for everyone.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={SECONDARY_BUTTON_SM} onClick={() => setAsking(true)}>
            Reset to defaults
          </button>
          {ACCOUNTS_SAMPLE_DATA && (
            <Tooltip label="These permissions are saved in this browser only, until the permissions backend is connected." describe>
              <span tabIndex={0} className="font-ui inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-sm font-medium text-fg-muted">
                Sample data
              </span>
            </Tooltip>
          )}
        </div>
      </header>
      {PERMISSION_ROLES.map((item) => (
        <RoleCard key={`${item.role}-${version}`} {...item} />
      ))}
      <ConfirmDialog
        open={asking}
        title="Reset all permissions?"
        confirmLabel="Reset permissions"
        pending={false}
        onConfirm={() => {
          resetPermissions()
          setVersion((n) => n + 1)
          setAsking(false)
          toast.show({ kind: 'success', message: 'Permissions reset to the defaults' })
        }}
        onClose={() => setAsking(false)}
      >
        Customer, staff and admin page access all go back to the defaults, and unsaved changes on this page are lost.
      </ConfirmDialog>
    </div>
  )
}
