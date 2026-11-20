/** A native checkbox drawn as a switch, so keyboard and screen readers work as for any checkbox. Name it with `label` or by wrapping it in a <label>. `success` turns it green when on. */
export function Switch({ checked, onChange, label, disabled, success }: { checked: boolean; onChange: (on: boolean) => void; label?: string; disabled?: boolean; success?: boolean }) {
  return (
    <span className={`relative inline-flex h-5 w-9 shrink-0 ${disabled ? 'opacity-60' : ''}`}>
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-default" />
      <span aria-hidden="true" className={`absolute inset-0 rounded-full bg-line-strong transition-colors ${success ? 'peer-checked:bg-success' : 'peer-checked:bg-chrome-strong'} peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fg motion-reduce:transition-none`} />
      <span aria-hidden="true" className="absolute top-0.5 left-0.5 size-4 rounded-full bg-canvas shadow-sm transition-transform peer-checked:translate-x-4 motion-reduce:transition-none" />
    </span>
  )
}
