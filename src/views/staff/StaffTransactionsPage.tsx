import { useCallback, useEffect, useRef, useState } from "react";
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
import { Tooltip } from "../../components/ui/Tooltip";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useMetaDescription } from "../../hooks/useMetaDescription";
import { useSection } from "../../hooks/useSection";
import { UUID } from "../../service/fetchProductList";
import {
  fetchTransactionDetail,
  fetchTransactionExport,
  fetchTransactionList,
  fetchTransactionSummary,
  type PaginatedTransactions,
  type TransactionListItem,
} from "../../service/fetchTransactions";
import {
  sampleTransactionExport,
  sampleTransactionList,
  sampleTransactionSummary,
  TRANSACTIONS_SAMPLE_DATA,
} from "../../service/sampleTransactions";
import type { RequestOptions } from "../../service/simulateRequest";
import { downloadFile } from "../../utils/downloadFile";
import { manilaToday } from "../../utils/period";
import { buildTransactionsCsv } from "../../utils/transactionsCsv";
import {
  DEFAULT_DIR,
  rangeDates,
  readTransactionQuery,
  SORT_COLUMN,
  withTransactionParams,
  type TransactionSort,
} from "../../utils/transactionQuery";

const META_DESCRIPTION =
  "Search every SilhouFit order by order number or customer name, filter by date range, and open any order to see its items, units, unit prices and total.";

export function StaffTransactionsPage() {
  useDocumentTitle("Transactions — SilhouFit");
  useMetaDescription(META_DESCRIPTION);

  const [params, setParams] = useSearchParams();
  const query = readTransactionQuery(params);
  const { q, range, sort, dir, page, per } = query;
  const filtered = Boolean(q || range);
  // A preset is worked out from today; only its two dates go into the fetcher, so it changes only when a value does.
  const { from, to } = rangeDates(query);

  const load = useCallback(
    (options: RequestOptions): Promise<PaginatedTransactions> => {
      const listParams = {
        search: q || undefined,
        from,
        to,
        sortBy: SORT_COLUMN[sort],
        sortOrder: dir,
        page,
        limit: per,
      };
      if (TRANSACTIONS_SAMPLE_DATA)
        return sampleTransactionList(listParams, options);
      if (UUID.test(q)) {
        // A pasted full order ID opens that order. No order with that ID is an empty result.
        const meta = {
          total: 1,
          page: 1,
          limit: per,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        };
        return fetchTransactionDetail(q, options).then(
          (order) => ({ data: [order], meta }),
          (error: unknown) => {
            if ((error as { kind?: string } | null)?.kind === "not-found")
              return { data: [], meta: { ...meta, total: 0, totalPages: 0 } };
            throw error;
          },
        );
      }
      return fetchTransactionList(listParams, options);
    },
    [q, from, to, sort, dir, page, per],
  );
  const { state, previous, retry } = useSection(load);
  const result = state.status === "success" ? state.data : previous;
  const stale = state.status === "loading" && result !== undefined;

  // The totals strip is its own section: the filtered range's figures, whatever the sort or page.
  const loadSummary = useCallback(
    (options: RequestOptions) =>
      (TRANSACTIONS_SAMPLE_DATA
        ? sampleTransactionSummary
        : fetchTransactionSummary)({ search: q || undefined, from, to }, options),
    [q, from, to],
  );
  const totals = useSection(loadSummary);
  const totalsResult =
    totals.state.status === "success" ? totals.state.data : totals.previous;

  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      const rows = await (
        TRANSACTIONS_SAMPLE_DATA
          ? sampleTransactionExport
          : fetchTransactionExport
      )({
        search: q || undefined,
        from,
        to,
        sortBy: SORT_COLUMN[sort],
        sortOrder: dir,
      });
      downloadFile(
        new Blob([buildTransactionsCsv(rows)], {
          type: "text/csv;charset=utf-8",
        }),
        `transactions-${manilaToday().date}.csv`,
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
        action: { label: "Retry", onClick: () => void exportCsv() },
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
    update({ q: "", range: "", from: "", to: "" });
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
  // The totals show only above a list that has rows, as before: not over an error or an empty result.
  const showTotals =
    !(state.status === "error" && !result) && result?.data.length !== 0;

  // `selected` outlives `open`, so the drawer keeps its title and content while it slides out.
  const [selected, setSelected] = useState<TransactionListItem | null>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const openDetail = (transaction: TransactionListItem) => {
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
        {TRANSACTIONS_SAMPLE_DATA && (
          <Tooltip
            label="These orders are generated placeholders until the orders backend is connected."
            describe
          >
            <span
              tabIndex={0}
              className="font-ui inline-flex h-8 items-center rounded-full border border-line-strong px-3 text-sm font-medium text-fg-muted"
            >
              Sample data
            </span>
          </Tooltip>
        )}
      </header>

      {showTotals &&
        (totals.state.status === "error" ? (
          <div className="rounded-xl border border-line bg-canvas-sub p-3">
            <SectionError
              what="the totals"
              kind={totals.state.kind}
              onRetry={totals.retry}
            />
          </div>
        ) : totalsResult ? (
          totalsResult.count > 0 && (
            <TransactionTotals
              summary={totalsResult}
              stale={totals.state.status === "loading"}
            />
          )
        ) : (
          <TransactionTotalsSkeleton />
        ))}

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
          canExport={(result?.meta.total ?? 0) > 0}
          exporting={exporting}
          onExport={() => void exportCsv()}
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
                  Check the spelling, or clear the search and date filter and
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
                  Orders show here as soon as customers check out.
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
