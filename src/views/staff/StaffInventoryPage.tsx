import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { InventoryPagerSkeleton } from "../../components/staff/InventorySkeleton";
import { InventoryCards } from "../../components/staff/inventory/InventoryCards";
import { InventoryDrawer } from "../../components/staff/inventory/InventoryDrawer";
import { ProductFormSheet } from "../../components/staff/inventory/ProductFormSheet";
import { VariantSheet } from "../../components/staff/inventory/VariantSheet";
import { InventoryTable } from "../../components/staff/inventory/InventoryTable";
import { focusFiltersTrigger } from "../../utils/chipFocus";
import { filterChips } from "../../components/staff/inventory/filterChips";
import { InventoryToolbar } from "../../components/staff/inventory/InventoryToolbar";
import {
  PAGER_FOOTER,
  PAGER_PAGINATION,
} from "../../components/staff/inventory/layout";
import { InventoryTabs } from "../../components/staff/inventory/InventoryTabs";
import { PlusIcon } from "../../components/form/icons";
import { SectionError } from "../../components/staff/StaffSection";
import { STAFF_SECTION } from "../../components/staff/StaffSkeleton";
import { Pagination } from "../../components/shop/Pagination";
import {
  PRIMARY_BUTTON,
  PRIMARY_BUTTON_SM,
  SECONDARY_BUTTON,
} from "../../components/ui/buttonStyles";
import { useToast } from "../../components/toast/useToast";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useMetaDescription } from "../../hooks/useMetaDescription";
import { useSection } from "../../hooks/useSection";
import {
  fetchProductById,
  fetchProductList,
  ProductListError,
  UUID,
  type PaginatedProducts,
  type ProductDetailFields,
  type ProductListItem,
  type ProductVariant,
} from "../../service/fetchProductList";
import {
  failureReason,
  manageFailureReason,
  removeProduct,
  setArchived,
} from "../../service/inventoryActions";
import type { RequestOptions } from "../../service/simulateRequest";
import { formatPeso } from "../../utils/format";
import {
  activeFilterCount,
  CLEAR_FILTERS,
  DEFAULT_DIR,
  priceRangeInvalid,
  readInventoryQuery,
  SORT_COLUMN,
  withInventoryParams,
  type InventorySort,
} from "../../utils/inventoryQuery";
import type { ProductEditSource } from "../../utils/productValidation";

const META_DESCRIPTION =
  "Search the SilhouFit product catalogue by name, brand or product ID, filter by category, gender and stock, and check the stock of every size and color.";

export function StaffInventoryPage() {
  useDocumentTitle("Inventory — SilhouFit");
  useMetaDescription(META_DESCRIPTION);

  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const query = readInventoryQuery(params);
  const { status, q, category, gender, brand, size, color, minPrice, maxPrice, stock, ar, sort, dir, page, per } = query;
  const badRange = priceRangeInvalid(query);
  const archivedView = status === "archived";
  const [refreshKey, setRefreshKey] = useState(0);
  const filtered = Boolean(q) || activeFilterCount(query) > 0;

  // The URL is the one source of truth. Only the primitives go into the fetcher, so it changes only when a value does.
  const load = useCallback(
    (options: RequestOptions): Promise<PaginatedProducts> => {
      // A minimum above the maximum matches nothing; the page says so instead of asking.
      if (badRange)
        return Promise.resolve({
          data: [],
          meta: { total: 0, page: 1, limit: per, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
        });
      if (UUID.test(q)) {
        // A pasted full ID opens that product, as in the dashboard's lookup. No product with that ID is an empty result.
        const meta = {
          total: 1,
          page: 1,
          limit: per,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        };
        return fetchProductById(q, options).then(
          (product) => ({ data: [product], meta }),
          (error: unknown) => {
            if (error instanceof ProductListError && error.kind === "not-found")
              return { data: [], meta: { ...meta, total: 0, totalPages: 0 } };
            throw error;
          },
        );
      }
      return fetchProductList(
        {
          search: q || undefined,
          category: category || undefined,
          gender: gender || undefined,
          brand: brand || undefined,
          size: size || undefined,
          color: color || undefined,
          minPrice,
          maxPrice,
          stockLevel: stock === "in" || stock === "out" ? stock : undefined,
          isArReady: ar ? ar === "yes" : undefined,
          sortBy: SORT_COLUMN[sort],
          sortOrder: dir,
          page,
          limit: per,
          status: archivedView ? "archived" : undefined,
        },
        options,
      );
    },
    // `refreshKey` is not read inside: a new one loads the list again after stock or status changed.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [
      status,
      q,
      category,
      gender,
      brand,
      size,
      color,
      minPrice,
      maxPrice,
      badRange,
      stock,
      ar,
      sort,
      dir,
      page,
      per,
      refreshKey,
    ],
  );
  // Each answer remembers which tab it is for. Switching tabs shows the skeleton until the other tab's list arrives;
  // filters, sorting and paging keep the previous rows, dimmed, as before.
  const fetcher = useCallback((options: RequestOptions) => load(options).then((list) => ({ ...list, forStatus: status })), [load, status]);
  const { state, previous, retry } = useSection(fetcher);
  const latest = state.status === "success" ? state.data : previous;
  const result = latest?.forStatus === status ? latest : undefined;
  const stale = state.status === "loading" && result !== undefined;

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
    changes: Parameters<typeof withInventoryParams>[1],
    replace = false,
  ) =>
    setParams((current) => withInventoryParams(current, changes), { replace });

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
    update(CLEAR_FILTERS);
  }

  function sortBy(column: InventorySort) {
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

  const total = result?.meta.total;
  const rows = result?.data ?? null;

  // `selected` outlives `open`, so the drawer keeps its title and content while it slides out.
  const [selected, setSelected] = useState<ProductListItem | null>(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const [startEditing, setStartEditing] = useState(false);
  const openDetail = (product: ProductListItem, edit = false) => {
    setSelected(product);
    setStartEditing(edit);
    setSession((n) => n + 1);
    setOpen(true);
  };

  // After a change the row may be gone or have lost its button: once the list has settled, focus goes to the product's row, or to the open tab.
  const restoreFocus = useRef<string | null>(null);
  useEffect(() => {
    const id = restoreFocus.current;
    if (!id || open || state.status === "loading") return;
    restoreFocus.current = null;
    if (document.activeElement && document.activeElement !== document.body)
      return;
    const section = sectionRef.current;
    const targets = [
      ...(section?.querySelectorAll<HTMLElement>(
        `[data-product="${id}"] button`,
      ) ?? []),
      ...(section?.querySelectorAll<HTMLElement>(
        '[role="tab"][aria-selected="true"]',
      ) ?? []),
    ];
    for (const target of targets) {
      target.focus({ preventScroll: true });
      if (document.activeElement === target) break;
    }
  }, [state, open]);

  const inFlight = useRef(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const refresh = () => setRefreshKey((n) => n + 1);

  /** Archives or restores one product. Resolves to null when it worked or what went wrong. `fromUndo` leaves out the Undo button. */
  async function changeArchived(
    product: ProductListItem,
    archive: boolean,
    fromUndo = false,
  ): Promise<string | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusyId(product.id);
    try {
      await setArchived(product.id, archive);
    } catch (error) {
      return `Couldn't ${archive ? "archive" : "restore"} ${product.name}. ${failureReason(error)}`;
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
    restoreFocus.current = product.id;
    setOpen(false);
    refresh();
    toast.show({
      kind: "success",
      message: `${product.name} ${archive ? "archived" : "restored"}`,
      action: fromUndo
        ? undefined
        : { label: "Undo", onClick: () => void run(product, !archive, true) },
    });
    return null;
  }

  /** Deletes one product for good. Resolves to null when it worked (the drawer closes) or what went wrong. A product that is already gone counts as deleted. */
  async function deleteProduct(
    product: ProductListItem,
  ): Promise<string | null> {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusyId(product.id);
    try {
      await removeProduct(product.id);
    } catch (error) {
      if ((error as { kind?: string }).kind !== "not-found")
        return `Couldn't delete ${product.name}. ${manageFailureReason(error, "delete-product")}`;
    } finally {
      inFlight.current = false;
      setBusyId(null);
    }
    focusAdd.current = true;
    setOpen(false);
    refresh();
    toast.show({ kind: "success", message: `${product.name} deleted` });
    return null;
  }

  /** `changeArchived` for callers with no place to show an error: it goes to a toast with a retry. */
  async function run(
    product: ProductListItem,
    archive: boolean,
    fromUndo = false,
  ) {
    const message = await changeArchived(product, archive, fromUndo);
    if (message)
      toast.show({
        kind: "error",
        message,
        action: {
          label: "Retry",
          onClick: () => void run(product, archive, fromUndo),
        },
      });
  }

  // Add product: the sheet starts empty each time it opens (a new key). Once the product exists the list shows newest first and focus goes back to the Add button.
  const [adding, setAdding] = useState(false);
  const [addSession, setAddSession] = useState(0);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusAdd = useRef(false);
  const openAdd = () => {
    setAddSession((n) => n + 1);
    setAdding(true);
  };
  useEffect(() => {
    if (!focusAdd.current || adding || state.status === "loading") return;
    focusAdd.current = false;
    if (
      !document.activeElement ||
      document.activeElement === document.body ||
      !document.activeElement.isConnected
    )
      addButton.current?.focus();
  }, [state, adding]);

  function onCreated(created: { id: string; name: string }) {
    focusAdd.current = true;
    setAdding(false);
    update({ status: "", sort: "", dir: "", page: "" });
    refresh();
    toast.show({
      kind: "success",
      message: `${created.name} added`,
      action: {
        label: "View",
        onClick: () => {
          written.current = created.name;
          setText(created.name);
          update({ ...CLEAR_FILTERS, q: created.name, status: "" });
        },
      },
    });
  }

  // Edit details: the sheet opens as the drawer closes, and stays mounted while it slides out.
  const [editTarget, setEditTarget] = useState<ProductEditSource | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSession, setEditSession] = useState(0);
  const openEdit = (product: ProductListItem, fields: ProductDetailFields) => {
    setEditTarget({ id: product.id, name: product.name, ...fields });
    setEditSession((n) => n + 1);
    setEditOpen(true);
    setOpen(false);
  };

  // Add or edit a variant: the drawer steps aside for the sheet and comes back, with fresh variants, when it closes.
  const [variantSheet, setVariantSheet] = useState<{
    mode: "add" | "edit";
    variant?: ProductVariant;
  } | null>(null);
  const openVariantSheet = (mode: "add" | "edit", variant?: ProductVariant) => {
    setVariantSheet({ mode, variant });
    setOpen(false);
  };
  const closeVariantSheet = () => {
    setVariantSheet(null);
    if (selected) openDetail(selected);
  };

  const actions = {
    onRestock: (product: ProductListItem) => openDetail(product, true),
    onRestore: (product: ProductListItem) => void run(product, false),
    busyId,
  };

  const tabs = (
    <InventoryTabs
      value={status}
      onChange={(next) =>
        update({ status: next === "archived" ? "archived" : "" })
      }
    />
  );

  return (
    <div className="grid gap-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl text-fg sm:text-3xl">Inventory</h1>
          <p className="mt-1 text-xs text-fg-muted">
            {archivedView
              ? "Hidden from the shop until you restore them."
              : "Active products, as the shop lists them."}
          </p>
          <p className="mt-1 h-5 text-sm text-fg-muted">
            {total === undefined ? null : (
              <>
                <span className="tabular-nums">{total}</span>{" "}
                {filtered ? "matching " : ""}
                {archivedView ? "archived " : ""}
                {total === 1 ? "product" : "products"}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            ref={addButton}
            type="button"
            onClick={openAdd}
            className={PRIMARY_BUTTON_SM}
          >
            <PlusIcon />
            Add product
          </button>
        </div>
      </header>

      <section
        ref={sectionRef}
        aria-labelledby="inventory-list"
        className={`${STAFF_SECTION} scroll-mt-14`}
      >
        <h2 id="inventory-list" className="sr-only">
          Products
        </h2>
        <InventoryToolbar
          text={text}
          onText={setText}
          query={query}
          onFilter={(changes) => update(changes)}
          onSort={(nextSort, nextDir) => update({ sort: nextSort, dir: nextDir })}
          onPer={(n) => update({ per: String(n) })}
          onClear={clearFilters}
          tabs={tabs}
        />
        <p role="status" className="sr-only">
          {state.status === "loading" ? "Loading products" : ""}
        </p>

        {badRange && (
          <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-danger p-3 text-sm text-danger">
            <p className="min-w-0">
              The minimum price ({formatPeso(minPrice!)}) is higher than the maximum ({formatPeso(maxPrice!)}), so nothing can match.
              Lower the minimum or raise the maximum.
            </p>
            <button type="button" onClick={() => {
                focusFiltersTrigger();
                update({ minPrice: "", maxPrice: "" });
              }}
              className={`${SECONDARY_BUTTON} min-h-9 text-sm`}>
              Clear price range
            </button>
          </div>
        )}

        {state.status === "error" && result && (
          <div className="mb-3 rounded-xl border border-line bg-canvas-sub p-3">
            <SectionError
              what="the latest products"
              kind={state.kind}
              onRetry={retry}
            />
            <p className="mt-3 text-sm text-fg-muted">
              The list below is from before your last change.
            </p>
          </div>
        )}

        {badRange ? null : state.status === "error" && !result ? (
          <SectionError what="the products" kind={state.kind} onRetry={retry} />
        ) : result && result.data.length === 0 ? (
          <div>
            {result.meta.total > 0 ? (
              <>
                <p className="text-base text-fg-muted">
                  There are no products on page {page}.
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
                  No products match
                </p>
                <p className="mt-1 text-base text-fg-muted">
                  {[q && `search "${q}"`, ...filterChips(query).map((chip) => `${chip.kind} ${chip.text}`)].filter(Boolean).join(", ")}.
                  Check the spelling, or clear the search and filters and try
                  again.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className={`${SECONDARY_BUTTON} mt-3`}
                >
                  Clear all
                </button>
              </>
            ) : archivedView ? (
              <>
                <p className="text-base font-semibold text-fg">
                  No archived products
                </p>
                <p className="mt-1 text-base text-fg-muted">
                  Products you archive are hidden from the shop and listed here,
                  where you can restore them.
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-fg">
                  No products yet
                </p>
                <p className="mt-1 text-base text-fg-muted">
                  Add the first product to start tracking its stock.
                </p>
                <button
                  type="button"
                  onClick={openAdd}
                  className={`${PRIMARY_BUTTON} mt-3`}
                >
                  <PlusIcon />
                  Add product
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <InventoryTable
              sorted={{ sort, dir }}
              onSort={sortBy}
              rows={rows}
              skeletonRows={per}
              stale={stale}
              onOpen={openDetail}
              actions={actions}
            />
            <InventoryCards
              rows={rows}
              skeletonRows={per}
              stale={stale}
              onOpen={openDetail}
              actions={actions}
            />
            {result ? (
              <div className={PAGER_FOOTER}>
                <div ref={pagerRef} className={PAGER_PAGINATION}>
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
              <InventoryPagerSkeleton />
            )}
          </>
        )}
      </section>

      <ProductFormSheet
        key={addSession}
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={onCreated}
      />

      {editTarget && (
        <ProductFormSheet
          key={editSession}
          open={editOpen}
          product={editTarget}
          onClose={() => setEditOpen(false)}
          onSaved={(name) => {
            restoreFocus.current = editTarget.id;
            setEditOpen(false);
            refresh();
            toast.show({ kind: "success", message: `${name} updated` });
          }}
        />
      )}

      {variantSheet && selected && (
        <VariantSheet
          mode={variantSheet.mode}
          productId={selected.id}
          category={selected.category}
          variant={variantSheet.variant}
          onSaved={() => {
            toast.show({
              kind: "success",
              message:
                variantSheet.mode === "add" ? "Variant added" : "Variant updated",
            });
            refresh();
            closeVariantSheet();
          }}
          onClose={closeVariantSheet}
        />
      )}

      <InventoryDrawer
        product={selected}
        open={open}
        session={session}
        startEditing={startEditing}
        refreshKey={refreshKey}
        onClose={() => setOpen(false)}
        onArchive={changeArchived}
        onDelete={deleteProduct}
        onEditDetails={openEdit}
        onAddVariant={() => openVariantSheet("add")}
        onEditVariant={(variant) => openVariantSheet("edit", variant)}
        onStockChanged={() => {
          if (selected) restoreFocus.current = selected.id;
          refresh();
        }}
      />
    </div>
  );
}
