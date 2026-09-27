const ROWS = [
  { label: 'Sales by channel', value: 72 },
  { label: 'Inventory turnover', value: 54 },
  { label: 'Fitting to checkout', value: 38 },
]

export function DashboardMock() {
  return (
    <div>
      <div className="flex items-center justify-between border-b border-ink/10 pb-4 dark:border-white/10">
        <span className="text-sm font-semibold text-ink dark:text-bone">
          Dashboard preview
        </span>
      </div>
      <div className="mt-6 space-y-5">
        {ROWS.map((row) => (
          <div key={row.label}>
            <div className="flex justify-between text-sm text-ink/70 dark:text-bone/75">
              <span>{row.label}</span>
            </div>
            <div className="mt-2 h-2 rounded-sm bg-ink/10 dark:bg-white/10">
              <div
                className="h-2 rounded-sm bg-ink dark:bg-bone"
                style={{ width: `${row.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-ink/50 dark:text-bone/50">
        Illustrative layout, not live data.
      </p>
    </div>
  )
}
