import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  PAGER_FOOTER,
  PAGER_PAGINATION,
} from "../../components/staff/inventory/layout";
import {
  TransactionPagerSkeleton,
  TransactionTotalsSkeleton,
} from "../../components/staff/TransactionsSkeleton";
import { PAGER_ROWS } from "../../components/staff/transactions/layout";
import { SectionError } from "../../components/staff/StaffSection";
import { STAFF_SECTION } from "../../components/staff/StaffSkeleton";
import { TransactionCards } from "../../components/staff/transactions/TransactionCards";
import { TransactionDrawer } from "../../components/staff/transactions/TransactionDrawer";
import { TransactionTable } from "../../components/staff/transactions/TransactionTable";
import { TransactionToolbar } from "../../components/staff/transactions/TransactionToolbar";
import { TransactionTotals } from "../../components/staff/transactions/TransactionTotals";
import { useToast } from "../../components/toast/useToast";
import { Pagination } from "../../components/shop/Pagination";
import { SECONDARY_BUTTON } from "../../components/ui/buttonStyles";
import { SampleDataBadge } from "../../components/ui/SampleDataBadge";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useMetaDescription } from "../../hooks/useMetaDescription";
import { useSection } from "../../hooks/useSection";
import { UUID } from "../../service/fetchProductList";
import {
  fetchAdminTransactionMetrics,
  fetchAdminTransactions,
  type AdminTransactionRow,
  type AdminTransactionsPage,
} from "../../service/adminTransactionsApi";
import { usesSampleOrders } from "../../service/ordersApi";
import {
  sampleAdminTransactionMetrics,
  sampleAdminTransactions,
} from "../../service/sampleTransactions";
import type { RequestOptions } from "../../service/simulateRequest";
import { downloadFile } from "../../utils/downloadFile";
import { manilaToday } from "../../utils/period";
import {
  DEFAULT_DIR,
  rangeDates,
  readTransactionQuery,
  SORT_COLUMN,
  withTransactionParams,
  type TransactionSort,
} from "../../utils/transactionQuery";

const META_DESCRIPTION =
  "Search every SilhouFit payment by order, customer or reference, filter by status, method and date, and open one to see its fee, net amount and gateway record.";

// shortcut: client-side page walk capped at 1,000 rows, upgrade when the API ships /admin/transactions/export
const EXPORT_CAP = 1000;
const EXPORT_PAGE = 100;

export function StaffTransactionsPage() {
  useDocumentTitle("Transactions — SilhouFit");
  useMetaDescription(META_DESCRIPTION);

  const [params, setParams] = useSearchParams();
  const query = readTransactionQuery(params);
  const { q, range, status, method, provider, sort, dir, page, per } = query;
  const filtered = Boolean(q || range || status || method || provider);
  const sample = usesSampleOrders();
  const fetchList = sample ? sampleAdminTransactions : fetchAdminTransactions;
  // A preset is worked out from today; only its two dates go into the fetcher, so it changes only when a value does.
  const { from, to } = rangeDates(query);

  // A pasted full order ID lists that order's payments; any other text is searched.
  const filters = useMemo(
    () => ({
      search: UUID.test(q) ? undefined : q || undefined,
      orderId: UUID.test(q) ? q : undefined,
      status: status || undefined,
      method: method || undefined,
      provider: provider || undefined,
      from,
      to,
      sortBy: SORT_COLUMN[sort],
      sortOrder: dir,
    }),
    [q, status, method, provider, from, to, sort, dir],
  );
  const load = useCallback(
    (options: RequestOptions): Promise<AdminTransactionsPage> =>
      fetchList({ ...filters, page, limit: per }, options),
    [fetchList, filters, page, per],
  );
  const { state, previous, retry } = useSection(load);
  const result = state.status === "success" ? state.data : previous;
  const stale = state.status === "loading" && result !== undefined;

  // The totals strip is its own section: every payment, whatever the filters, sort or page. It loads once.
  const loadTotals = useCallback(
    (options: RequestOptions) =>
      (sample
        ? sampleAdminTransactionMetrics
        : fetchAdminTransactionMetrics)(options),
    [sample],
  );
  const totals = useSection(loadTotals);
  const totalsResult =
    totals.state.status === "success" ? totals.state.data : totals.previous;

  const toast = useToast();
  const user = useCurrentUser();
  const [exporting, setExporting] = useState(false);
  const matches = result?.meta.total ?? 0;
  const exportBlock =
    matches === 0
      ? "There are no transactions to export"
      : matches > EXPORT_CAP
        ? "Narrow the filters to 1,000 transactions or fewer to export"
        : null;
  async function exportExcel() {
    setExporting(true);
    try {
      // One request at a time, so a long export never bursts the API's rate limit.
      const rows: AdminTransactionRow[] = [];
      for (let next = 1; rows.length < EXPORT_CAP; next++) {
        const { data, meta } = await fetchList({
          ...filters,
          page: next,
          limit: EXPORT_PAGE,
        });
        rows.push(...data);
        if (next >= meta.totalPages || data.length === 0) break;
      }
      rows.length = Math.min(rows.length, EXPORT_CAP);
      // Loaded on demand: ExcelJS is large and only staff exporting need it.
      const {
        buildTransactionsXlsx,
        filtersSummary,
        renderWatermark,
        XLSX_MIME,
      } = await import("../../utils/transactionsXlsx");
      const file = await buildTransactionsXlsx({
        rows,
        exportedBy: { name: user?.name, email: user?.email },
        exportedAt: new Date(),
        filtersSummary: filtersSummary(query),
        watermark: (await renderWatermark()) ?? undefined,
      });
      downloadFile(
        new Blob([file], { type: XLSX_MIME }),
        `transactions-${manilaToday().date}.xlsx`,
      );
      toast.show({
        kind: "success",
        message: `${rows.length} ${rows.length === 1 ? "transaction" : "transactions"} exported`,
      });
    } catch {
      toast.show({
        kind: "error",
        message:
          "Couldn't export the transactions. The list could not be fetched, so no file was made. Check your connection, then retry.",
        action: { label: "Retry", onClick: () => void exportExcel() },
      });
    } finally {
      setExporting(false);
    }
  }

  // Paging with the pager: once the new page renders, keep keyboard focus in the pager and bring the list back into view.
  const sectionRef = useRef<HTMLElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  const paged = useRef(false);
  useEffect(() => {
    if (!paged.current) return;
    paged.current = false;
    const section = sectionRef.current;
    if (section && section.getBoundingClientRect().top < 56) {
      const reduce = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      section.scrollIntoView({
        block: "start",
        behavior: reduce ? "auto" : "smooth",
      });
    }
    // Next or Prev may have just been disabled, which would drop focus to the page. Move it to the current page (or Prev when that number is hidden on phones).
    const focused = document.activeElement;
    if (
      focused &&
      focused !== document.body &&
      !(focused instanceof HTMLButtonElement && focused.disabled)
    )
      return;
    const nav = pagerRef.current?.querySelector("nav");
    for (const target of [
      nav?.querySelector<HTMLElement>('[aria-current="page"]'),
      nav?.querySelector<HTMLElement>("button:not(:disabled)"),
    ]) {
      target?.focus({ preventScroll: true });
      if (document.activeElement === target) break;
    }
  }, [page]);

  const update = (
    changes: Parameters<typeof withTransactionParams>[1],
    replace = false,
  ) =>
    setParams((current) => withTransactionParams(current, changes), {
      replace,
    });

  // The box keeps its own text; the URL gets the term once typing pauses. A URL that changes by itself (back, forward) wins.
  const [text, setText] = useState(q);
  const term = useDebouncedValue(text.trim(), 300);
  const written = useRef(q);
  useEffect(() => {
    if (term === written.current) return;
    written.current = term;
    update({ q: term }, true);
    // `update` only wraps setParams.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);
  useEffect(() => {
    if (q === written.current) return;
    written.current = q;
    setText(q);
  }, [q]);

  function clearFilters() {
    written.current = "";
    setText("");
    update({
      q: "",
      range: "",
      from: "",
      to: "",
      status: "",
      method: "",
      provider: "",
    });
  }

  function sortBy(column: TransactionSort) {
    update({
      sort: column,
      dir:
        sort === column
          ? dir === "asc"
            ? "desc"
            : "asc"
          : DEFAULT_DIR[column],
    });
  }

  const rows = result?.data ?? null;

  // `selected` outlives `open`, so the drawer keeps its title and content while it slides out.
  const [selected, setSelected] = useState<AdminTransactionRow | null>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const openDetail = (transaction: AdminTransactionRow) => {
    setSelected(transaction);
    setSession((n) => n + 1);
    setOpen(true);
  };

  return (
    <div className="grid gap-3">
      <header className="flex min-h-8 flex-wrap items-center justify-between gap-3">
        <h1 className="display min-w-0 text-2xl text-fg sm:text-3xl">
          Transactions
        </h1>
        {sample && (
          <SampleDataBadge reason="These transactions are placeholders for this test account." />
        )}
      </header>

      {totals.state.status === "error" ? (
        <div className="rounded-xl border border-line bg-canvas-sub p-3">
          <SectionError
            what="the totals"
            kind={totals.state.kind}
            onRetry={totals.retry}
          />
        </div>
      ) : totalsResult ? (
        totalsResult.totalTransactions > 0 && (
          <TransactionTotals
            metrics={totalsResult}
            stale={totals.state.status === "loading"}
          />
        )
      ) : (
        <TransactionTotalsSkeleton />
      )}

      <section
        ref={sectionRef}
        aria-labelledby="transactions-list"
        className={`${STAFF_SECTION} scroll-mt-14`}
      >
        <h2 id="transactions-list" className="sr-only">
          Transactions
        </h2>
        <TransactionToolbar
          text={text}
          onText={setText}
          query={query}
          today={manilaToday().date}
          onFilter={(changes) => update(changes)}
          onSort={(nextSort, nextDir) =>
            update({ sort: nextSort, dir: nextDir })
          }
          onPer={(n) => update({ per: String(n) })}
          onClear={clearFilters}
          exportBlock={exportBlock}
          exporting={exporting}
          onExport={() => void exportExcel()}
        />
        <p role="status" className="sr-only">
          {state.status === "loading" ? "Loading transactions" : ""}
        </p>

        {state.status === "error" && result && (
          <div className="mb-3 rounded-xl border border-line bg-canvas-sub p-3">
            <SectionError
              what="the latest transactions"
              kind={state.kind}
              onRetry={retry}
            />
            <p className="mt-3 text-sm text-fg-muted">
              The list below is from before your last change.
            </p>
          </div>
        )}

        {state.status === "error" && !result ? (
          <SectionError
            what="the transactions"
            kind={state.kind}
            onRetry={retry}
          />
        ) : result && result.data.length === 0 ? (
          <div>
            {result.meta.total > 0 ? (
              <>
                <p className="text-base text-fg-muted">
                  There are no transactions on page {page}.
                </p>
                <button
                  type="button"
                  onClick={() => update({ page: "" })}
                  className={`${SECONDARY_BUTTON} mt-3`}
                >
                  Go to the first page
                </button>
              </>
            ) : filtered ? (
              <>
                <p className="text-base font-semibold text-fg">
                  No transactions match
                </p>
                <p className="mt-1 text-base text-fg-muted">
                  Check the spelling, or clear the search and filters and
                  try again.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className={`${SECONDARY_BUTTON} mt-3`}
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-fg">
                  No transactions yet
                </p>
                <p className="mt-1 text-base text-fg-muted">
                  Payments show here once customers pay at checkout.
                </p>
              </>
            )}
          </div>
        ) : (
          <>
            <TransactionTable
              sorted={{ sort, dir }}
              onSort={sortBy}
              rows={rows}
              skeletonRows={per}
              stale={stale}
              onOpen={openDetail}
            />
            <TransactionCards
              rows={rows}
              skeletonRows={per}
              stale={stale}
              onOpen={openDetail}
            />
            {result ? (
              <div className={PAGER_FOOTER}>
                <div
                  ref={pagerRef}
                  className={`${PAGER_PAGINATION} ${PAGER_ROWS}`}
                >
                  <Pagination
                    page={page}
                    pageCount={Math.max(1, result.meta.totalPages)}
                    from={(page - 1) * per + 1}
                    to={Math.min(page * per, result.meta.total)}
                    total={result.meta.total}
                    onPage={(next) => {
                      paged.current = true;
                      update({ page: next > 1 ? String(next) : "" });
                    }}
                  />
                </div>
              </div>
            ) : (
              <TransactionPagerSkeleton />
            )}
          </>
        )}
      </section>

      <TransactionDrawer
        transaction={selected}
        open={open}
        session={session}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
