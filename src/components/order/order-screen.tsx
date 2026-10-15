"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { loadOrderAction, saveOrderAction } from "@/app/(till)/order/actions";
import { Icon } from "@/components/icons";
import { READY_EVENT, type ReadyDetail } from "@/components/till/till-live";
import {
  addItem,
  changeQuantity,
  draftFromOrder,
  draftTotals,
  emptyDraft,
  itemCount,
  quantitiesByItem,
  setDetails,
  setNote,
  toSaveInput,
  type Draft,
} from "@/lib/orders/draft";
import type { MenuEntry, OrderDetail, OrderSummary } from "@/lib/orders/service";
import { formatCedis } from "@/lib/money";
import { MenuGrid } from "./menu-grid";
import { OpenOrdersDialog } from "./open-orders";
import { TicketPanel } from "./ticket-panel";
import { Toast } from "./toast";

type Props = {
  menu: MenuEntry[];
  openOrders: OrderSummary[];
  staffName: string;
  /** Order to show on arrival (e.g. back from the pay screen). */
  initialOrder?: OrderDetail | null;
};

const ALL = "All";

export function OrderScreen({ menu, openOrders, staffName, initialOrder = null }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => (initialOrder ? draftFromOrder(initialOrder) : emptyDraft()));
  const [category, setCategory] = useState(ALL);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false); // phones: full-screen ticket
  const [ordersOpenedAt, setOrdersOpenedAt] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const ordersRef = useRef<HTMLDialogElement>(null);

  const categories = useMemo(() => [ALL, ...new Set(menu.map((m) => m.category))], [menu]);
  const query = search.trim().toLowerCase();
  // Searching looks across every category.
  const visible = menu.filter((m) => (query ? m.name.toLowerCase().includes(query) : category === ALL || m.category === category));
  const quantities = quantitiesByItem(draft);
  const count = itemCount(draft);

  const update = (change: (d: Draft) => Draft) => {
    setDraft(change);
    setError(null);
  };

  // The kitchen bumped an order: tell whoever is on this till.
  useEffect(() => {
    const onReady = (e: Event) => {
      const { orderNumber, label } = (e as CustomEvent<ReadyDetail>).detail;
      setToast({ id: Date.now(), message: `Order #${orderNumber} is ready · ${label}` });
    };
    window.addEventListener(READY_EVENT, onReady);
    return () => window.removeEventListener(READY_EVENT, onReady);
  }, []);

  // Leaving phone layout (e.g. rotating a tablet) closes the full-screen ticket.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 768px)");
    const onChange = () => wide.matches && setTicketOpen(false);
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  const confirmDiscard = () => !draft.dirty || window.confirm("Discard the unsaved changes on this ticket?");

  const save = (send: boolean) =>
    startTransition(async () => {
      const result = await saveOrderAction(toSaveInput(draft, send));
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const { number } = result.order;
      setDraft(emptyDraft());
      setTicketOpen(false);
      setToast({
        id: Date.now(),
        message: send
          ? `Order #${number} sent to the kitchen · ${result.sentItems} item${result.sentItems === 1 ? "" : "s"}`
          : `Order #${number} held`,
      });
    });

  /** Hold any changes, then go and take payment. */
  const pay = () =>
    startTransition(async () => {
      let orderId = draft.orderId;
      if (!orderId || draft.dirty) {
        const result = await saveOrderAction(toSaveInput(draft, false));
        if (!result.ok) {
          setError(result.error);
          return;
        }
        orderId = result.order.id;
      }
      router.push(`/pay/${orderId}`);
    });

  const openOrder = (id: string) => {
    if (id === draft.orderId && !draft.dirty) return closeOrders();
    if (!confirmDiscard()) return;
    // A part-paid order can only be finished on the pay screen.
    if ((openOrders.find((o) => o.id === id)?.paid ?? 0) > 0) {
      closeOrders();
      return router.push(`/pay/${id}`);
    }
    startTransition(async () => {
      const order = await loadOrderAction(id);
      closeOrders();
      if (!order) {
        setError("That order no longer exists.");
        return;
      }
      setDraft(draftFromOrder(order));
      setError(null);
    });
  };

  const startNew = () => {
    if (!confirmDiscard()) return;
    setDraft(emptyDraft());
    setError(null);
  };

  const showOrders = () => {
    setOrdersOpenedAt(Date.now());
    ordersRef.current?.showModal();
  };
  const closeOrders = () => {
    ordersRef.current?.close();
    setOrdersOpenedAt(null);
  };
  const clearToast = useCallback(() => setToast(null), []);

  return (
    <div className="flex h-full min-h-0">
      {/* Menu */}
      <section aria-labelledby="order-title" inert={ticketOpen} className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-2 border-b border-ink-700 p-3 sm:gap-3 sm:p-4">
          <h1 id="order-title" className="font-display text-2xl font-bold whitespace-nowrap">
            {draft.number ? `Order #${draft.number}` : "New order"}
          </h1>
          <div className="order-last flex h-12 w-full items-center gap-2 rounded-xl border border-ink-600 bg-ink-900 px-3 focus-within:border-amber sm:order-none sm:w-auto sm:flex-1">
            <Icon name="search" className="size-4 shrink-0 text-cream-faint" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search dishes or drinks"
              aria-label="Search dishes or drinks"
              className="h-full w-full bg-transparent text-cream placeholder:text-cream-faint/70 focus:outline-none"
            />
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={showOrders}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-ink-600 px-3 text-sm font-semibold hover:bg-ink-800"
            >
              <Icon name="orders" className="size-4" />
              Open orders
              <span className="grid min-w-6 place-items-center rounded-full bg-ink-700 px-1.5 text-xs">{openOrders.length}</span>
            </button>
            <button
              type="button"
              onClick={startNew}
              disabled={!draft.orderId && !draft.dirty}
              className="flex min-h-11 items-center gap-1.5 rounded-xl border border-ink-600 px-3 text-sm font-semibold enabled:hover:bg-ink-800 disabled:opacity-40"
            >
              <Icon name="plus" className="size-4" />
              New
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <nav aria-label="Categories" className="shrink-0 border-b border-ink-700 lg:w-40 lg:border-r lg:border-b-0">
            <ul className="flex gap-2 overflow-x-auto p-3 [scrollbar-width:none] lg:flex-col lg:overflow-visible lg:p-4">
              {categories.map((c) => {
                const active = !query && c === category;
                return (
                  <li key={c} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setCategory(c);
                        setSearch("");
                      }}
                      aria-pressed={active}
                      className={`min-h-11 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors motion-reduce:transition-none lg:w-full lg:rounded-xl lg:text-left ${
                        active ? "border-amber bg-amber-soft text-cream" : "border-ink-700 bg-ink-850 text-cream-muted hover:text-cream"
                      }`}
                    >
                      {c}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-24 sm:p-4 md:pb-4">
            <MenuGrid items={visible} quantities={quantities} onAdd={(item) => update((d) => addItem(d, item))} />
          </div>
        </div>
      </section>

      {/* Ticket: side panel from tablets up, full screen on phones */}
      <TicketPanel
        className={ticketOpen ? "fixed inset-0 z-50 flex md:static md:z-auto" : "hidden md:flex"}
        draft={draft}
        staffName={staffName}
        pending={pending}
        error={error}
        onType={(type) => update((d) => setDetails(d, { type }))}
        onTableLabel={(tableLabel) => update((d) => setDetails(d, { tableLabel }))}
        onCustomerName={(customerName) => update((d) => setDetails(d, { customerName }))}
        onQuantity={(key, delta) => update((d) => changeQuantity(d, key, delta))}
        onNote={(key, note) => update((d) => setNote(d, key, note))}
        onHold={() => save(false)}
        onSend={() => save(true)}
        onPay={pay}
        onClose={() => setTicketOpen(false)}
      />

      {/* Phones: summary bar above the bottom tabs */}
      {!ticketOpen ? (
        <button
          type="button"
          onClick={() => setTicketOpen(true)}
          className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex min-h-12 items-center justify-between rounded-xl bg-amber px-4 font-semibold text-amber-ink shadow-[0_0.5rem_1.5rem_rgb(0_0_0/0.5)] md:hidden"
        >
          <span>
            View order · {count} item{count === 1 ? "" : "s"}
          </span>
          <span className="tabular-nums">{formatCedis(draftTotals(draft).total)}</span>
        </button>
      ) : null}

      <OpenOrdersDialog
        ref={ordersRef}
        orders={openOrders}
        currentId={draft.orderId}
        openedAt={ordersOpenedAt}
        onOpen={openOrder}
        onClose={closeOrders}
      />

      {toast ? <Toast key={toast.id} message={toast.message} onDone={clearToast} /> : null}
    </div>
  );
}
